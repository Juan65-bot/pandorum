import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularCancelamento, type CanceladoPor } from '@/lib/cancelamento'
import { enviarEmail, emailCancelamentoPaciente, emailCancelamentoPsicologo } from '@/lib/email'
import { capitalizarNome } from '@/lib/utils'

/**
 * Cancela uma sessão aplicando a política da plataforma.
 *
 * Por que existe como rota de servidor, e não como update direto do browser:
 * o valor cobrado não pode ser decidido no cliente. Quem determina se o
 * cancelamento é tardio é o relógio do servidor comparado com starts_at do
 * banco — nada do que o browser mandar influencia a conta. O corpo da
 * requisição só carrega qual sessão cancelar e um motivo opcional.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { appointmentId, motivo } = (await request.json()) as {
    appointmentId?: string
    motivo?: string
  }

  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })
  }

  // Lido com a sessão do usuário: a RLS já garante que ele só enxerga sessões
  // das quais participa. Se voltar vazio, ou não existe ou não é dele.
  const { data: sessao } = await supabase
    .from('appointments')
    .select('id, patient_id, psychologist_id, starts_at, ends_at, status')
    .eq('id', appointmentId)
    .maybeSingle()

  if (!sessao) {
    return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
  }

  if (sessao.status === 'cancelled') {
    return NextResponse.json({ error: 'Essa sessão já está cancelada.' }, { status: 409 })
  }
  if (sessao.status === 'completed') {
    return NextResponse.json({ error: 'Sessão já concluída não pode ser cancelada.' }, { status: 409 })
  }
  if (new Date(sessao.ends_at) < new Date()) {
    return NextResponse.json({ error: 'Essa sessão já terminou.' }, { status: 409 })
  }

  // ---------- quem está cancelando ----------
  const { data: perfil } = await supabase
    .from('profiles')
    .select('role, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  const { data: psicologoDoUsuario } = await supabase
    .from('psychologists')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()

  const ehPaciente = sessao.patient_id === user.id
  const ehPsicologoDaSessao = psicologoDoUsuario?.id === sessao.psychologist_id
  const ehAdmin = perfil?.role === 'admin'

  if (!ehPaciente && !ehPsicologoDaSessao && !ehAdmin) {
    return NextResponse.json(
      { error: 'Só o paciente ou o psicólogo da sessão podem cancelá-la.' },
      { status: 403 }
    )
  }

  const canceladoPor: CanceladoPor = ehPaciente ? 'patient' : ehPsicologoDaSessao ? 'psychologist' : 'admin'

  // ---------- a conta, feita aqui e só aqui ----------
  const resultado = calcularCancelamento({ startsAt: sessao.starts_at, canceladoPor })

  // A partir daqui escrevo com service role: os campos financeiros e de
  // auditoria do cancelamento são protegidos por trigger contra escrita vinda
  // do usuário, e o paciente não teria permissão de RLS para gravar um
  // pagamento quando quem cancela é o psicólogo.
  const admin = createAdminClient()
  const agora = new Date().toISOString()

  const { error: erroSessao } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: agora,
      cancelled_by: user.id,
      cancelled_by_role: canceladoPor,
      cancellation_notice_hours: resultado.horasDeAntecedencia,
      late_cancellation: resultado.tardio,
      cancelled_reason:
        (motivo || '').trim() ||
        `Cancelada por ${canceladoPor === 'psychologist' ? 'psicólogo(a)' : canceladoPor === 'admin' ? 'administração' : 'paciente'}`,
    })
    .eq('id', appointmentId)

  if (erroSessao) {
    console.error('Erro ao cancelar sessão:', erroSessao)
    return NextResponse.json({ error: 'Não foi possível cancelar a sessão.' }, { status: 500 })
  }

  // ---------- financeiro ----------
  const { data: pagamento } = await admin
    .from('payments')
    .select('id, status, amount_total')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  const jaPago = pagamento?.status === 'paid'
  const valorPago = Number(pagamento?.amount_total ?? 0)

  let avisoFinanceiro: string | null = null

  if (resultado.tardio) {
    // Retém a multa e devolve o excedente, se houver o que devolver.
    const linha = {
      patient_id: sessao.patient_id,
      psychologist_id: sessao.psychologist_id,
      appointment_id: appointmentId,
      amount_total: resultado.valorMulta,
      platform_fee: resultado.comissaoPlataforma,
      psy_payout: resultado.repassePsicologo,
      cancellation_fee: resultado.valorMulta,
      is_late_cancellation: true,
      refunded_amount: jaPago ? Math.max(0, valorPago - resultado.valorMulta) : 0,
      status: (jaPago ? 'paid' : 'pending') as 'paid' | 'pending',
    }

    const { error } = pagamento
      ? await admin.from('payments').update(linha).eq('id', pagamento.id)
      : await admin.from('payments').insert(linha)

    if (error) {
      console.error('ATENÇÃO: sessão cancelada mas o registro financeiro falhou:', appointmentId, error)
      avisoFinanceiro = 'A sessão foi cancelada, mas houve um problema ao registrar a cobrança. Nossa equipe foi notificada.'
    }

    if (!jaPago) {
      // A cobrança em si depende do Stripe, que ainda não faz captura fora do
      // checkout. A linha fica 'pending' e aparece no painel financeiro.
      console.warn(
        `Cancelamento tardio sem pagamento prévio (sessão ${appointmentId}): ` +
        `taxa de R$ ${resultado.valorMulta} registrada como pendente, cobrança precisa ser feita manualmente.`
      )
    }
  } else if (pagamento) {
    // Cancelamento gratuito: devolve tudo o que houver.
    const { error } = await admin
      .from('payments')
      .update({
        status: jaPago ? 'refunded' : 'failed',
        refunded_amount: jaPago ? valorPago : 0,
        cancellation_fee: 0,
        is_late_cancellation: false,
        platform_fee: 0,
        psy_payout: 0,
      })
      .eq('id', pagamento.id)

    if (error) {
      console.error('Erro ao registrar reembolso do cancelamento:', appointmentId, error)
      avisoFinanceiro = 'A sessão foi cancelada, mas houve um problema ao registrar o reembolso. Nossa equipe foi notificada.'
    }
  }

  // ---------- notificações ----------
  const [{ data: perfilPaciente }, { data: psicologo }] = await Promise.all([
    admin.from('profiles').select('full_name, email').eq('id', sessao.patient_id).maybeSingle(),
    admin
      .from('psychologists')
      .select('profiles!profile_id(full_name, email)')
      .eq('id', sessao.psychologist_id)
      .maybeSingle(),
  ])

  const perfilPsicologo = psicologo?.profiles as unknown as { full_name: string | null; email: string | null } | null

  const dados = {
    dataHoraSessao: sessao.starts_at,
    canceladoPor,
    nomePaciente: capitalizarNome(perfilPaciente?.full_name) || 'o paciente',
    nomePsicologo: capitalizarNome(perfilPsicologo?.full_name) || 'o profissional',
    resultado,
  }

  await Promise.all([
    perfilPaciente?.email
      ? enviarEmail({
          para: perfilPaciente.email,
          ...emailCancelamentoPaciente(dados),
        })
      : Promise.resolve(null),
    perfilPsicologo?.email
      ? enviarEmail({
          para: perfilPsicologo.email,
          ...emailCancelamentoPsicologo(dados),
        })
      : Promise.resolve(null),
  ])

  return NextResponse.json({
    ok: true,
    tardio: resultado.tardio,
    valorMulta: resultado.valorMulta,
    repassePsicologo: resultado.repassePsicologo,
    comissaoPlataforma: resultado.comissaoPlataforma,
    reembolso: jaPago ? Math.max(0, valorPago - resultado.valorMulta) : 0,
    explicacao: resultado.explicacao,
    aviso: avisoFinanceiro,
  })
}
