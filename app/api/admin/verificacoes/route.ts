import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  enviarEmail,
  emailAprovado,
  emailRejeitado,
  emailDocumentoAdicional,
} from '@/lib/email'
import { capitalizarNome } from '@/lib/utils'
import { asaasConfigurado, criarSubcontaPsicologo, AsaasError } from '@/lib/asaas'
import { CHECKLIST_VERIFICACAO, type PsychologistStatus, type VerificationAction } from '@/lib/types'

type Acao = 'aprovar' | 'rejeitar' | 'solicitar_documento' | 'suspender' | 'reativar'

const NOVO_STATUS: Record<Acao, PsychologistStatus> = {
  aprovar: 'approved',
  rejeitar: 'rejected',
  solicitar_documento: 'pending_documents',
  suspender: 'suspended',
  reativar: 'approved',
}

const ACAO_LOG: Record<Acao, VerificationAction> = {
  aprovar: 'approved',
  rejeitar: 'rejected',
  solicitar_documento: 'requested_document',
  suspender: 'suspended',
  reativar: 'reinstated',
}

/**
 * Toda decisão de verificação passa por aqui — nunca por um update direto do
 * browser — para que três coisas aconteçam juntas e na mesma ordem: a mudança
 * de status, o registro imutável em verification_audit_log e a notificação por
 * e-mail ao psicólogo.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: perfilAdmin } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (perfilAdmin?.role !== 'admin') {
    return NextResponse.json({ error: 'Acesso restrito a administradores' }, { status: 403 })
  }

  const { psychologistId, acao, checklist, motivo } = (await request.json()) as {
    psychologistId?: string
    acao?: Acao
    checklist?: Record<string, boolean>
    motivo?: string
  }

  if (!psychologistId || !acao || !(acao in NOVO_STATUS)) {
    return NextResponse.json({ error: 'psychologistId e uma ação válida são obrigatórios' }, { status: 400 })
  }

  const { data: psicologo } = await supabase
    .from('psychologists')
    .select('id, status, asaas_wallet_id, full_name_document, cpf, birth_date, income_value, postal_code, address_street, address_number, address_complement, address_district, address_city, address_state, profiles!profile_id(full_name, email, phone)')
    .eq('id', psychologistId)
    .maybeSingle()

  if (!psicologo) {
    return NextResponse.json({ error: 'Psicólogo não encontrado' }, { status: 404 })
  }

  // ---------- regras por ação ----------
  if (acao === 'aprovar') {
    const marcados = CHECKLIST_VERIFICACAO.every((item) => checklist?.[item.chave] === true)
    if (!marcados) {
      return NextResponse.json(
        { error: 'Todos os itens do checklist precisam ser confirmados antes de aprovar.' },
        { status: 400 }
      )
    }
  }

  const motivoLimpo = (motivo || '').trim()
  if ((acao === 'rejeitar' || acao === 'solicitar_documento') && motivoLimpo.length < 10) {
    return NextResponse.json(
      {
        error:
          acao === 'rejeitar'
            ? 'Descreva o motivo da rejeição (mínimo 10 caracteres) — ele é enviado ao psicólogo.'
            : 'Descreva o que está faltando (mínimo 10 caracteres) — o texto é enviado ao psicólogo.',
      },
      { status: 400 }
    )
  }

  // ---------- atualização de status ----------
  const agora = new Date().toISOString()
  const novoStatus = NOVO_STATUS[acao]

  const patch: Record<string, unknown> = {
    status: novoStatus,
    reviewed_at: agora,
    reviewed_by: user.id,
  }

  if (acao === 'aprovar' || acao === 'reativar') {
    patch.approved_at = agora
    patch.approved_by = user.id
    patch.rejection_reason = null
    patch.additional_document_request = null
  }
  if (acao === 'rejeitar') {
    patch.rejection_reason = motivoLimpo
    patch.additional_document_request = null
  }
  if (acao === 'solicitar_documento') {
    patch.additional_document_request = motivoLimpo
    patch.rejection_reason = null
  }
  if (acao === 'suspender') {
    patch.rejection_reason = motivoLimpo || null
  }

  // ---------- subconta Asaas ----------
  // Criada aqui, na aprovação, e não em algum passo que o psicólogo precise
  // fazer sozinho: ele não deve ter que sair do Pandorum para receber.
  //
  // Falhar aqui NÃO impede a aprovação. O cadastro dele está correto — o que
  // falta é uma integração externa, e travar a aprovação por isso deixaria um
  // profissional legítimo parado por um motivo que ele não pode resolver. O
  // erro fica gravado em asaas_account_error para o admin ver na tela, e a
  // rota de cobrança já recusa agendamento com quem não tem walletId.
  let avisoSubconta: string | null = null

  if (acao === 'aprovar' && !psicologo.asaas_wallet_id) {
    const perfilPsi = psicologo.profiles as unknown as {
      full_name: string | null; email: string | null; phone: string | null
    } | null

    const faltando = [
      !psicologo.cpf && 'CPF',
      !psicologo.birth_date && 'data de nascimento',
      !psicologo.postal_code && 'CEP',
      !psicologo.address_street && 'logradouro',
      !psicologo.address_number && 'número',
      !psicologo.address_district && 'bairro',
      !psicologo.address_city && 'cidade',
      !psicologo.address_state && 'estado',
      !psicologo.income_value && 'renda mensal',
      !perfilPsi?.phone && 'telefone',
      !perfilPsi?.email && 'e-mail',
    ].filter(Boolean) as string[]

    if (faltando.length) {
      avisoSubconta = `Conta de recebimento não criada — faltam dados no cadastro: ${faltando.join(', ')}.`
      patch.asaas_account_error = avisoSubconta
    } else if (!asaasConfigurado()) {
      avisoSubconta = 'Conta de recebimento não criada: ASAAS_API_KEY não configurada.'
      patch.asaas_account_error = avisoSubconta
    } else {
      try {
        const subconta = await criarSubcontaPsicologo({
          nome: psicologo.full_name_document || perfilPsi!.full_name || 'Psicólogo',
          email: perfilPsi!.email!,
          cpf: psicologo.cpf!,
          nascimento: psicologo.birth_date!,
          telefone: perfilPsi!.phone!,
          rendaMensal: Number(psicologo.income_value),
          cep: psicologo.postal_code!,
          logradouro: psicologo.address_street!,
          numero: psicologo.address_number!,
          complemento: psicologo.address_complement,
          bairro: psicologo.address_district!,
          cidade: psicologo.address_city!,
          estado: psicologo.address_state!,
        })

        patch.asaas_account_id = subconta.id
        patch.asaas_wallet_id = subconta.walletId
        patch.asaas_account_error = null
      } catch (erro) {
        const detalhe = erro instanceof AsaasError ? erro.message : 'erro inesperado'
        console.error('Falha ao criar subconta Asaas para', psychologistId, detalhe)
        avisoSubconta =
          'Cadastro aprovado, mas a conta de recebimento não pôde ser criada. ' +
          'Ele não conseguirá receber agendamentos até isso ser resolvido. Detalhe: ' + detalhe
        patch.asaas_account_error = detalhe
      }
    }
  }

  const { error: erroUpdate } = await supabase.from('psychologists').update(patch).eq('id', psychologistId)

  if (erroUpdate) {
    console.error('Erro ao atualizar status de verificação:', erroUpdate)
    return NextResponse.json({ error: 'Não foi possível atualizar o status desse cadastro.' }, { status: 500 })
  }

  // ---------- auditoria ----------
  // Falha aqui não desfaz o update acima (o PostgREST não dá transação entre as
  // duas chamadas), então registra alto no log para não passar despercebido.
  const { error: erroLog } = await supabase.from('verification_audit_log').insert({
    psychologist_id: psychologistId,
    admin_id: user.id,
    admin_name: perfilAdmin?.full_name || null,
    action: ACAO_LOG[acao],
    checklist: acao === 'aprovar' ? checklist : null,
    reason: motivoLimpo || null,
    previous_status: psicologo.status,
    new_status: novoStatus,
  })

  if (erroLog) {
    console.error('ATENÇÃO: status alterado mas o log de auditoria falhou:', psychologistId, acao, erroLog)
  }

  // ---------- notificação ----------
  const perfil = psicologo.profiles as unknown as { full_name: string | null; email: string | null } | null
  const nome = capitalizarNome(perfil?.full_name) || 'psicólogo(a)'
  let emailEnviado: boolean | null = null

  if (perfil?.email) {
    const template =
      acao === 'aprovar' || acao === 'reativar'
        ? emailAprovado(nome)
        : acao === 'rejeitar'
          ? emailRejeitado(nome, motivoLimpo)
          : acao === 'solicitar_documento'
            ? emailDocumentoAdicional(nome, motivoLimpo)
            : null

    if (template) {
      const resultado = await enviarEmail({ para: perfil.email, assunto: template.assunto, html: template.html })
      emailEnviado = resultado.enviado
    }
  }

  return NextResponse.json({ ok: true, novoStatus, emailEnviado, auditoriaRegistrada: !erroLog, avisoSubconta })
}
