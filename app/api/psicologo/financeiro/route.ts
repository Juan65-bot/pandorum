import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { descriptografar } from '@/lib/crypto'
import { obterSaldoSubconta, asaasConfigurado, AsaasError } from '@/lib/asaas'
import { capitalizarNome } from '@/lib/utils'

/**
 * Dados do painel financeiro do psicólogo.
 *
 * Existe como rota de servidor por dois motivos: o saldo vem do Asaas com a
 * chave da subconta, que é uma credencial que nunca pode chegar ao browser; e o
 * extrato precisa cruzar payments com o nome do paciente, que a RLS entrega ao
 * psicólogo mas exige um join que é mais barato fazer aqui.
 *
 * O saldo é opcional de propósito: se o Asaas estiver fora do ar, ou a subconta
 * ainda não existir, o extrato e os totais continuam aparecendo. Eles vêm do
 * banco e são a informação que o psicólogo realmente usa para conferir o mês.
 */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: psicologo } = await supabase
    .from('psychologists')
    .select('id, status, asaas_wallet_id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!psicologo) {
    return NextResponse.json({ error: 'Só psicólogos têm painel financeiro' }, { status: 403 })
  }

  // ---------- extrato ----------
  // A RLS de payments já limita ao psicólogo dono; o filtro por id é redundância
  // barata, para o caso de a policy mudar um dia.
  // Traz TODOS os status, não só 'paid'. Um extrato que esconde o pendente e o
  // falhado responde "quanto entrou", mas não "o que aconteceu" — e é a segunda
  // pergunta que o psicólogo faz quando uma sessão que ele atendeu não aparece.
  const { data: pagamentos, error: erroPagamentos } = await supabase
    .from('payments')
    .select('id, amount_total, psy_payout, status, paid_at, due_date, billing_type, is_late_cancellation, appointment_id, patient_id, appointments(starts_at)')
    .eq('psychologist_id', psicologo.id)
    .order('paid_at', { ascending: false, nullsFirst: true })

  if (erroPagamentos) {
    console.error('Erro ao carregar extrato do psicólogo:', erroPagamentos)
    return NextResponse.json({ error: 'Não foi possível carregar seu extrato.' }, { status: 500 })
  }

  const linhas = pagamentos || []

  // nome do paciente: uma consulta só, em vez de um join por linha
  const idsPacientes = [...new Set(linhas.map((p) => p.patient_id).filter(Boolean))]
  const nomes = new Map<string, string>()

  if (idsPacientes.length) {
    const { data: perfis } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', idsPacientes)
    for (const p of perfis || []) nomes.set(p.id, capitalizarNome(p.full_name) || 'Paciente')
  }

  const extrato = linhas.map((p) => {
    const sessao = p.appointments as unknown as { starts_at: string } | null
    return {
      id: p.id,
      status: p.status as 'paid' | 'pending' | 'failed' | 'refunded',
      data: p.paid_at,
      vencimento: p.due_date,
      dataSessao: sessao?.starts_at ?? null,
      paciente: nomes.get(p.patient_id) || 'Paciente',
      valorRecebido: Number(p.psy_payout),
      meioPagamento: p.billing_type,
      taxaDeCancelamento: p.is_late_cancellation,
      appointmentId: p.appointment_id,
    }
  })

  // ---------- totais ----------
  // Recortados pelo mês em que o dinheiro ENTROU (paid_at), não pela data da
  // sessão: é assim que ele vai conferir contra o extrato bancário.
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const inicioMesAnterior = new Date(agora.getFullYear(), agora.getMonth() - 1, 1)

  // Só o que foi efetivamente pago entra nos totais: somar pendente inflaria o
  // mês com dinheiro que ainda pode não entrar.
  let totalMes = 0
  let totalMesAnterior = 0
  for (const e of extrato) {
    if (e.status !== 'paid' || !e.data) continue
    const d = new Date(e.data)
    if (d >= inicioMes) totalMes += e.valorRecebido
    else if (d >= inicioMesAnterior) totalMesAnterior += e.valorRecebido
  }

  const aguardandoPagamento = extrato
    .filter((e) => e.status === 'pending')
    .reduce((soma, e) => soma + e.valorRecebido, 0)

  // ---------- saldo ----------
  let saldo: number | null = null
  let saldoIndisponivel: string | null = null

  if (!psicologo.asaas_wallet_id) {
    saldoIndisponivel = 'Sua conta de recebimento ainda está sendo preparada.'
  } else if (!asaasConfigurado()) {
    saldoIndisponivel = 'Consulta de saldo indisponível no momento.'
  } else {
    const { data: cred } = await createAdminClient()
      .from('psychologist_asaas_credentials')
      .select('api_key_encrypted')
      .eq('psychologist_id', psicologo.id)
      .maybeSingle()

    const chave = descriptografar(cred?.api_key_encrypted)
    if (!chave) {
      saldoIndisponivel = 'Consulta de saldo indisponível no momento.'
      console.error('Sem chave de subconta para consultar saldo de', psicologo.id)
    } else {
      try {
        saldo = await obterSaldoSubconta(chave)
      } catch (erro) {
        saldoIndisponivel = 'Não conseguimos consultar seu saldo agora. Seu extrato abaixo continua correto.'
        console.error('Falha ao consultar saldo Asaas:', erro instanceof AsaasError ? erro.message : erro)
      }
    }
  }

  return NextResponse.json({
    saldo,
    saldoIndisponivel,
    totalMes,
    totalMesAnterior,
    diferencaMeses: Math.round((totalMes - totalMesAnterior) * 100) / 100,
    aguardandoPagamento,
    extrato,
  })
}
