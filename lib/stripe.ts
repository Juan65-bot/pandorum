import Stripe from 'stripe'

export function stripeConfigurado() {
  return !!process.env.STRIPE_SECRET_KEY
}

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY não configurada')
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY)
}

/** Comissão da plataforma sobre cada sessão paga (ver termos de aceite do psicólogo). */
export const TAXA_PLATAFORMA = 0.2

interface CriarCheckoutParams {
  appointmentId: string
  titulo: string
  preco: number
  emailPagador?: string
  siteUrl: string
}

export async function criarSessaoCheckout({ appointmentId, titulo, preco, emailPagador, siteUrl }: CriarCheckoutParams) {
  const stripe = getStripe()

  return stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'pix'],
    line_items: [
      {
        price_data: {
          currency: 'brl',
          product_data: { name: titulo },
          unit_amount: Math.round(preco * 100),
        },
        quantity: 1,
      },
    ],
    customer_email: emailPagador,
    metadata: { appointment_id: appointmentId },
    success_url: `${siteUrl}/sessoes/${appointmentId}/pagamento?status=sucesso`,
    cancel_url: `${siteUrl}/sessoes/${appointmentId}/pagamento?status=cancelado`,
  })
}
