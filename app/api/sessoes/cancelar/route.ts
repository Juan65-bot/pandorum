import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calcularCancelamento, type CanceladoPor } from '@/lib/cancelamento'
import { enviarEmail, emailCancelamentoPaciente, emailCancelamentoPsicologo } from '@/lib/email'
import { capitalizarNome, validarCPF } from '@/lib/utils'
import {
  asaasConfigurado,
  obterOuCriarCliente,
  criarCobrancaMultaCancelamento,
  AsaasError,
} from '@/lib/asaas'
import { createAdminClient as adminParaCobranca } from '@/lib/supabase/admin'

/**
 * Emite a cobrança avulsa da multa de cancelamento tardio.
 *
 * Separada da rota porque é o único ponto que fala com o gateway aqui, e porque
 * falhar nela não pode desfazer o cancelamento: a sessão já foi cancelada e o
 * horário já foi liberado. Quando não dá para cobrar, a linha de payments fica
 * 'pending' e o paciente é avisado de que a equipe entrará em contato — melhor
 * que fingir que cobrou.
 */
async function emitirCobrancaMulta(dados: {
  appointmentId: string
  patientProfileId: string
  psychologistId: string
  valor: number
  repassePsicologo: number
  paymentRowId?: string
}): Promise<{ ok: boolean; motivo?: string }> {
  if (!asaasConfigurado()) return { ok: false, motivo: 'ASAAS_API_KEY não configurada' }

  const admin = adminParaCobranca()

  const [{ data: perfil }, { data: paciente }, { data: psicologo }] = await Promise.all([
    admin.from('profiles').select('full_name, email, phone').eq('id', dados.patientProfileId).maybeSingle(),
    admin.from('patients').select('cpf').eq('profile_id', dados.patientProfileId).maybeSingle(),
    admin.from('psychologists').select('asaas_wallet_id').eq('id', dados.psychologistId).maybeSingle(),
  ])

  if (!paciente?.cpf || !validarCPF(paciente.cpf)) return { ok: false, motivo: 'paciente sem CPF válido' }
  if (!psicologo?.asaas_wallet_id) return { ok: false, motivo: 'psicólogo sem carteira Asaas' }

  try {
    const cliente = await obterOuCriarCliente({
      nome: capitalizarNome(perfil?.full_name) || 'Paciente Pandorum',
      cpf: paciente.cpf,
      email: perfil?.email || undefined,
      telefone: perfil?.phone || undefined,
    })

    const cobranca = await criarCobrancaMultaCancelamento({
      customerId: cliente.id,
      appointmentId: dados.appointmentId,
      descricao: 'Taxa de cancelamento com menos de 24h de antecedência',
      valor: dados.valor,
      repassePsicologo: dados.repassePsicologo,
      walletIdPsicologo: psicologo.asaas_wallet_id,
    })

    if (dados.paymentRowId) {
      await admin
        .from('payments')
        .update({ gateway_payment_id: cobranca.id, gateway_invoice_url: cobranca.invoiceUrl })
        .eq('id', dados.paymentRowId)
    }

    return { ok: true }
  } catch (erro) {
    return { ok: false, motivo: erro instanceof AsaasError ? erro.message : String(erro) }
  }
}

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
    .select('id, patient_id, psychologist_id, starts_at, ends_at, status, created_at')
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
  const resultado = calcularCancelamento({
    startsAt: sessao.starts_at,
    canceladoPor,
    criadoEm: sessao.created_at,
  })

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
      // Caso normal agora que a cobrança da sessão só vence 24h antes dela: o
      // paciente cancela em cima da hora sem nunca ter pago, então não há o que
      // reter — é preciso emitir uma cobrança nova, só da multa, com o mesmo
      // split (R$ 50 para o psicólogo, o resto para a plataforma).
      const emitida = await emitirCobrancaMulta({
        appointmentId,
        patientProfileId: sessao.patient_id,
        psychologistId: sessao.psychologist_id,
        valor: resultado.valorMulta,
        repassePsicologo: resultado.repassePsicologo,
        paymentRowId: pagamento?.id,
      })

      if (!emitida.ok) {
        avisoFinanceiro =
          'A sessão foi cancelada. A taxa de cancelamento ficou registrada como pendente e ' +
          'nossa equipe entrará em contato para a cobrança.'
        console.error('Multa de cancelamento não pôde ser cobrada:', appointmentId, emitida.motivo)
      }
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
