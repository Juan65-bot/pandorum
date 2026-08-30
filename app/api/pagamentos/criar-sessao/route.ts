import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  asaasConfigurado,
  obterOuCriarCliente,
  criarCobrancaSessao,
  calcularVencimento,
  AsaasError,
} from '@/lib/asaas'
import { capitalizarNome, validarCPF } from '@/lib/utils'
import {
  PRECO_SESSAO_PADRAO,
  REPASSE_PSICOLOGO_SESSAO,
  RETENCAO_PLATAFORMA_SESSAO,
  type BillingType,
} from '@/lib/types'

export async function POST(request: NextRequest) {
  if (!asaasConfigurado()) {
    return NextResponse.json(
      { error: 'Pagamentos ainda não configurados. Defina ASAAS_API_KEY no .env.local.' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { appointmentId, billingType } = (await request.json()) as {
    appointmentId?: string
    billingType?: BillingType
  }
  if (!appointmentId) {
    return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })
  }

  const { data: appointment } = await supabase
    .from('appointments')
    .select('*, psychologists(id, asaas_wallet_id, profiles!profile_id(full_name))')
    .eq('id', appointmentId)
    .single()

  if (!appointment || appointment.patient_id !== user.id) {
    return NextResponse.json({ error: 'Sessão não encontrada' }, { status: 404 })
  }
  if (appointment.status !== 'scheduled') {
    return NextResponse.json({ error: 'Essa sessão não está aguardando pagamento' }, { status: 400 })
  }

  const psicologo = appointment.psychologists as unknown as {
    id: string
    asaas_wallet_id: string | null
    profiles?: { full_name: string | null }
  } | null

  // Sem carteira do psicólogo não existe split, e sem split o dinheiro ficaria
  // inteiro com a plataforma — melhor recusar a cobrança do que criar uma
  // dívida silenciosa com o profissional.
  if (!psicologo?.asaas_wallet_id) {
    console.error('Psicólogo sem subconta Asaas ao tentar cobrar:', appointment.psychologist_id)
    return NextResponse.json(
      { error: 'Esse profissional ainda não concluiu o cadastro de recebimento. Tente outro horário ou outro psicólogo.' },
      { status: 409 }
    )
  }

  // ---------- dados do pagador ----------
  const [{ data: perfil }, { data: paciente }] = await Promise.all([
    supabase.from('profiles').select('full_name, email, phone').eq('id', user.id).maybeSingle(),
    supabase.from('patients').select('cpf').eq('profile_id', user.id).maybeSingle(),
  ])

  if (!paciente?.cpf || !validarCPF(paciente.cpf)) {
    return NextResponse.json(
      { error: 'CPF_OBRIGATORIO', mensagem: 'Informe seu CPF para gerar a cobrança.' },
      { status: 422 }
    )
  }

  try {
    const cliente = await obterOuCriarCliente({
      nome: capitalizarNome(perfil?.full_name) || 'Paciente Pandorum',
      cpf: paciente.cpf,
      email: perfil?.email || user.email,
      telefone: perfil?.phone || undefined,
    })

    const nomePsicologo = capitalizarNome(psicologo.profiles?.full_name) || 'psicólogo(a)'

    const cobranca = await criarCobrancaSessao({
      customerId: cliente.id,
      appointmentId,
      descricao: `Sessão de psicoterapia com ${nomePsicologo}`,
      inicioSessao: appointment.starts_at,
      walletIdPsicologo: psicologo.asaas_wallet_id,
      billingType: billingType || 'UNDEFINED',
    })

    const { error: erroPagamento } = await supabase.from('payments').upsert(
      {
        appointment_id: appointmentId,
        patient_id: user.id,
        psychologist_id: appointment.psychologist_id,
        amount_total: PRECO_SESSAO_PADRAO,
        platform_fee: RETENCAO_PLATAFORMA_SESSAO,
        psy_payout: REPASSE_PSICOLOGO_SESSAO,
        status: 'pending',
        gateway_payment_id: cobranca.id,
        gateway_invoice_url: cobranca.invoiceUrl,
        billing_type: cobranca.billingType,
        due_date: cobranca.dueDate || calcularVencimento(appointment.starts_at),
      },
      { onConflict: 'appointment_id' }
    )

    if (erroPagamento) {
      // O webhook faz UPDATE por gateway_payment_id/appointment_id, não upsert:
      // sem esta linha existindo, o pagamento confirmaria no Asaas e a sessão
      // nunca sairia de "aguardando pagamento".
      console.error('Erro ao registrar payment pendente:', erroPagamento)
      return NextResponse.json({ error: 'Não foi possível iniciar o pagamento' }, { status: 502 })
    }

    return NextResponse.json({
      checkout_url: cobranca.invoiceUrl,
      vencimento: cobranca.dueDate,
    })
  } catch (erro) {
    if (erro instanceof AsaasError) {
      console.error('Asaas recusou a criação da cobrança:', erro.message)
      return NextResponse.json(
        { error: 'O provedor de pagamento recusou a cobrança. Confira seus dados e tente de novo.' },
        { status: 502 }
      )
    }
    console.error('Falha inesperada ao criar cobrança:', erro)
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento' }, { status: 502 })
  }
}
