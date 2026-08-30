import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Webhook do Asaas.
 *
 * Diferença de segurança importante em relação ao Stripe: o Asaas NÃO assina o
 * corpo da requisição. A autenticação é um token estático que você mesmo define
 * e ele devolve no header `asaas-access-token`. Quem descobrir o token forja
 * qualquer evento — inclusive marcar uma sessão como paga sem dinheiro nenhum
 * ter entrado. Por isso: token longo, comparação em tempo constante, e a
 * whitelist de IP abaixo como segunda camada.
 *
 * Docs: https://docs.asaas.com/docs/mecanismos-de-seguranca
 */

/**
 * IPs oficiais do Asaas em produção.
 * https://docs.asaas.com/docs/ips-oficiais-do-asaas
 *
 * A checagem é OPT-IN via ASAAS_VALIDAR_IP=true, e é de propósito: a própria
 * documentação avisa que "em ambiente Sandbox podem existir IPs adicionais" e
 * recomenda não usar a lista de produção como garantia para o sandbox. Ligar
 * isso durante o desenvolvimento faria todo webhook de teste ser rejeitado.
 */
const IPS_ASAAS_PRODUCAO = [
  '52.67.12.206',
  '18.230.8.159',
  '54.94.136.112',
  '54.94.183.101',
]

function tokenConfere(recebido: string | null): boolean {
  const esperado = process.env.ASAAS_WEBHOOK_TOKEN
  if (!esperado || !recebido) return false

  const a = Buffer.from(recebido)
  const b = Buffer.from(esperado)

  // timingSafeEqual exige mesmo tamanho; comparar o tamanho antes vaza só o
  // comprimento, que não ajuda quem tenta adivinhar o conteúdo.
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

function ipAutorizado(request: NextRequest): boolean {
  if (process.env.ASAAS_VALIDAR_IP !== 'true') return true

  // atrás da Vercel, o IP real é o primeiro da cadeia do x-forwarded-for
  const encaminhado = request.headers.get('x-forwarded-for') || ''
  const ip = encaminhado.split(',')[0].trim()

  const extras = (process.env.ASAAS_IPS_EXTRAS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const permitidos = [...IPS_ASAAS_PRODUCAO, ...extras]
  if (permitidos.includes(ip)) return true

  console.error('Webhook do Asaas recusado por IP não autorizado:', ip)
  return false
}

interface EventoAsaas {
  event: string
  payment?: {
    id: string
    status: string
    value: number
    netValue?: number
    billingType?: string
    externalReference?: string
    invoiceUrl?: string
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error('ASAAS_WEBHOOK_TOKEN não configurada — webhook recusado')
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 503 })
  }

  if (!ipAutorizado(request)) {
    return NextResponse.json({ error: 'Origem não autorizada' }, { status: 403 })
  }

  if (!tokenConfere(request.headers.get('asaas-access-token'))) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
  }

  let evento: EventoAsaas
  try {
    evento = (await request.json()) as EventoAsaas
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const pagamento = evento.payment
  if (!pagamento) return NextResponse.json({ ok: true, ignorado: 'sem payment' })

  const admin = createAdminClient()

  // externalReference guarda o id do agendamento. As cobranças de multa de
  // cancelamento usam o prefixo "multa:" para não serem confundidas com a
  // cobrança da própria sessão, que tem outro efeito no agendamento.
  const referencia = pagamento.externalReference || ''
  const ehMulta = referencia.startsWith('multa:')
  const appointmentId = ehMulta ? referencia.slice('multa:'.length) : referencia

  if (!appointmentId) {
    return NextResponse.json({ ok: true, ignorado: 'sem externalReference' })
  }

  async function marcarPago() {
    await admin
      .from('payments')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        net_value: pagamento!.netValue ?? null,
        billing_type: pagamento!.billingType ?? null,
      })
      .eq('gateway_payment_id', pagamento!.id)

    // multa de cancelamento não confirma sessão nenhuma: o agendamento já foi
    // cancelado antes da cobrança existir.
    if (!ehMulta) {
      await admin.from('appointments').update({ status: 'confirmed' }).eq('id', appointmentId)
    }
  }

  async function marcarNaoPago(novoStatus: 'failed' | 'refunded') {
    await admin
      .from('payments')
      .update({ status: novoStatus })
      .eq('gateway_payment_id', pagamento!.id)

    if (ehMulta) return

    // Libera o horário. Sem isso o agendamento fica em 'scheduled' para sempre
    // depois de uma cobrança vencida, e gerarSlotsDisponiveis trata 'scheduled'
    // como ocupado — o horário sumiria da agenda sem nunca ter sido pago.
    // Só mexe em quem ainda não foi confirmado, para um evento fora de ordem
    // não derrubar sessão já paga.
    const { error } = await admin
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_reason: 'Pagamento não confirmado até o vencimento — horário liberado automaticamente',
        cancelled_at: new Date().toISOString(),
        cancelled_by_role: 'system',
      })
      .eq('id', appointmentId)
      .eq('status', 'scheduled')

    if (error) console.error('Erro ao liberar horário de cobrança vencida:', appointmentId, error)
  }

  switch (evento.event) {
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_CONFIRMED':
      await marcarPago()
      break

    case 'PAYMENT_OVERDUE':
    case 'PAYMENT_DELETED':
      await marcarNaoPago('failed')
      break

    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
      await marcarNaoPago('refunded')
      break

    default:
      // O Asaas manda dezenas de eventos e reenfileira tudo que não responder
      // 200. Responder ok para o que não interessa evita a fila travar.
      return NextResponse.json({ ok: true, ignorado: evento.event })
  }

  return NextResponse.json({ ok: true })
}
