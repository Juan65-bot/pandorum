import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { criarSessaoCheckout, stripeConfigurado, TAXA_PLATAFORMA } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  if (!stripeConfigurado()) {
    return NextResponse.json(
      { error: 'Pagamentos ainda não configurados. Defina STRIPE_SECRET_KEY no .env.local.' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  const { appointmentId } = await request.json()
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, psychologists(session_price, profiles!profile_id(full_name))')
    .eq('id', appointmentId)
    .single()

  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
  }

  if (appointment.status !== 'scheduled') {
    return NextResponse.json({ error: 'Essa sessão não está aguardando pagamento' }, { status: 400 })
  }

  const preco = Number(appointment.psychologists?.session_price || 0)
  if (preco <= 0) {
    return NextResponse.json({ error: 'Valor de sessão inválido' }, { status: 400 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

  try {
    const sessaoCheckout = await criarSessaoCheckout({
      appointmentId,
      titulo: `Sessão de psicoterapia com ${appointment.psychologists?.profiles?.full_name || 'psicólogo(a)'}`,
      preco,
      emailPagador: user.email,
      siteUrl,
    })

    const platformFee = Math.round(preco * TAXA_PLATAFORMA * 100) / 100

    await supabase.from('payments').upsert(
      {
        appointment_id: appointmentId,
        patient_id: user.id,
        psychologist_id: appointment.psychologist_id,
        amount_total: preco,
        platform_fee: platformFee,
        psy_payout: preco - platformFee,
        status: 'pending',
        stripe_payment_id: sessaoCheckout.id,
      },
      { onConflict: 'appointment_id' }
    )

    return NextResponse.json({ checkout_url: sessaoCheckout.url })
  } catch {
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento' }, { status: 502 })
  }
}
