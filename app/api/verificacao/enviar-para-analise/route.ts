import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { enviarEmail, emailDocumentosRecebidos } from '@/lib/email'
import { capitalizarNome } from '@/lib/utils'
import { DOCUMENTOS_OBRIGATORIOS } from '@/lib/types'

/**
 * Fecha a etapa de documentos e joga o cadastro na fila de análise do admin.
 *
 * Quem autoriza a transição de fato é o trigger protect_psychologist_approval_fields
 * (migration 0013), que só aceita pending_documents -> pending_review quando os 5
 * documentos existem no banco. As checagens aqui existem para devolver uma
 * mensagem útil ao psicólogo, não como barreira de segurança — a barreira é o banco.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { data: psicologo } = await supabase
    .from('psychologists')
    .select('id, status, full_name_document, cpf, crp_number, birth_date, verification_terms_accepted_at, profiles!profile_id(full_name, email)')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!psicologo) {
    return NextResponse.json({ error: 'Complete seus dados de cadastro antes de enviar para análise.' }, { status: 400 })
  }

  if (psicologo.status === 'pending_review') {
    return NextResponse.json({ ok: true, jaEnviado: true })
  }

  if (psicologo.status === 'approved') {
    return NextResponse.json({ error: 'Seu cadastro já está aprovado.' }, { status: 400 })
  }

  const camposFaltando = !psicologo.full_name_document || !psicologo.cpf || !psicologo.crp_number || !psicologo.birth_date
  if (camposFaltando) {
    return NextResponse.json({ error: 'Preencha todos os dados da etapa 1 antes de enviar.' }, { status: 400 })
  }

  if (!psicologo.verification_terms_accepted_at) {
    return NextResponse.json({ error: 'É preciso aceitar as declarações da etapa 3 antes de enviar.' }, { status: 400 })
  }

  const { data: documentos } = await supabase
    .from('psychologist_documents')
    .select('doc_type')
    .eq('psychologist_id', psicologo.id)

  const enviados = new Set((documentos || []).map((d) => d.doc_type))
  const faltando = DOCUMENTOS_OBRIGATORIOS.filter((d) => !enviados.has(d.tipo))

  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `Ainda faltam documentos: ${faltando.map((d) => d.label).join(', ')}.` },
      { status: 400 }
    )
  }

  const { data: atualizado, error } = await supabase
    .from('psychologists')
    .update({ status: 'pending_review' })
    .eq('id', psicologo.id)
    .select('status')
    .maybeSingle()

  if (error) {
    console.error('Erro ao enviar cadastro para análise:', error)
    return NextResponse.json({ error: 'Não foi possível enviar seu cadastro para análise.' }, { status: 500 })
  }

  // O trigger reverte silenciosamente uma transição não autorizada em vez de
  // retornar erro, então conferir o valor que voltou é a única forma de saber
  // se a mudança pegou de verdade.
  if (atualizado?.status !== 'pending_review') {
    return NextResponse.json(
      { error: 'Não foi possível enviar para análise. Confira se todos os documentos foram enviados corretamente.' },
      { status: 409 }
    )
  }

  const perfil = psicologo.profiles as unknown as { full_name: string | null; email: string | null } | null
  const destinatario = perfil?.email || user.email
  if (destinatario) {
    const { assunto, html } = emailDocumentosRecebidos(capitalizarNome(perfil?.full_name) || 'psicólogo(a)')
    await enviarEmail({ para: destinatario, assunto, html })
  }

  return NextResponse.json({ ok: true })
}
