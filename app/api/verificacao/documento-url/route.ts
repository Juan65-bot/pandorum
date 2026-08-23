import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALIDADE_SEGUNDOS = 300

/**
 * Gera URL assinada de curta duração (5 min) para um documento de verificação.
 *
 * O bucket 'verification-documents' é privado — não existe URL pública que
 * funcione. Quem decide se a assinatura pode ser emitida é a policy
 * verification_docs_owner_read no storage.objects: dono do arquivo ou admin.
 * Esta rota não faz a autorização por conta própria justamente para não haver
 * duas fontes de verdade; ela só repassa a sessão do usuário para o Storage.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const caminho = request.nextUrl.searchParams.get('path')
  if (!caminho) return NextResponse.json({ error: 'path é obrigatório' }, { status: 400 })

  const { data, error } = await supabase.storage
    .from('verification-documents')
    .createSignedUrl(caminho, VALIDADE_SEGUNDOS)

  if (error || !data?.signedUrl) {
    console.error('Erro ao assinar URL do documento:', caminho, error)
    return NextResponse.json({ error: 'Documento indisponível' }, { status: 404 })
  }

  return NextResponse.json({ url: data.signedUrl, expiraEm: VALIDADE_SEGUNDOS })
}
