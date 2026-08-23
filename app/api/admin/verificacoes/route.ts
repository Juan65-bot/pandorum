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
    .select('id, status, profiles!profile_id(full_name, email)')
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

  return NextResponse.json({ ok: true, novoStatus, emailEnviado, auditoriaRegistrada: !erroLog })
}
