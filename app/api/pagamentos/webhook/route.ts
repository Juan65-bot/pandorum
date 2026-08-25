import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

// Configuração do webhook: https://dashboard.stripe.com/webhooks
// Evento a assinar: checkout.session.completed, checkout.session.async_payment_succeeded,
// checkout.session.async_payment_failed, checkout.session.expired
export async function POST(request: NextRequest) {
  const assinatura = request.headers.get('stripe-signature')
  const corpoBruto = await request.text()

  if (!assinatura || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Webhook não configurado' }, { status: 400 })
  }

  let evento: Stripe.Event
  try {
    evento = getStripe().webhooks.constructEvent(corpoBruto, assinatura, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 })
  }

  const admin = createAdminClient()

  async function marcarPago(session: Stripe.Checkout.Session) {
    const appointmentId = session.metadata?.appointment_id
    if (!appointmentId) return

    await admin
      .from('payments')
      .update({ status: 'paid', stripe_payment_id: session.id, paid_at: new Date().toISOString() })
      .eq('appointment_id', appointmentId)

    await admin.from('appointments').update({ status: 'confirmed' }).eq('id', appointmentId)
  }

  async function marcarFalha(session: Stripe.Checkout.Session) {
    const appointmentId = session.metadata?.appointment_id
    if (!appointmentId) return

    await admin.from('payments').update({ status: 'failed' }).eq('appointment_id', appointmentId)

    // Libera o horário. Sem isso o agendamento ficava em 'scheduled' para
    // sempre depois de um checkout abandonado, e gerarSlotsDisponiveis trata
    // 'scheduled' como ocupado — o horário sumia da agenda do psicólogo sem
    // nunca ter sido pago. Só mexe em quem ainda não foi confirmado, para um
    // evento fora de ordem não derrubar sessão já paga.
    const { error } = await admin
      .from('appointments')
      .update({
        status: 'cancelled',
        cancelled_reason: 'Pagamento não concluído — horário liberado automaticamente',
      })
      .eq('id', appointmentId)
      .eq('status', 'scheduled')

    if (error) console.error('Erro ao liberar horário de checkout expirado:', appointmentId, error)
  }

  switch (evento.type) {
    case 'checkout.session.completed': {
      const session = evento.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid') {
        await marcarPago(session)
      }
      break
    }
    case 'checkout.session.async_payment_succeeded':
      await marcarPago(evento.data.object as Stripe.Checkout.Session)
      break
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await marcarFalha(evento.data.object as Stripe.Checkout.Session)
      break
  }

  return NextResponse.json({ ok: true })
}
