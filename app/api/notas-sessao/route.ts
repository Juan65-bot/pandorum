import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { criptografar, descriptografar } from '@/lib/crypto'

/**
 * Notas clínicas da sessão. Passam por essa rota (em vez de o browser falar
 * direto com o Supabase) porque o conteúdo é criptografado/descriptografado
 * com uma chave que só existe no servidor — nunca pode chegar ao bundle do
 * client. A RLS de session_notes continua valendo por baixo: só o psicólogo
 * dono da sessão (ou admin) consegue ler/escrever a linha.
 */

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const appointmentId = request.nextUrl.searchParams.get('appointmentId')
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })

  const { data, error } = await supabase
    .from('session_notes')
    .select('*')
    .eq('appointment_id', appointmentId)
    .maybeSingle()

  if (error) {
    console.error('Erro ao buscar notas da sessão:', error)
    return NextResponse.json({ error: 'Não foi possível carregar as notas' }, { status: 500 })
  }

  if (!data) return NextResponse.json({ nota: null })

  return NextResponse.json({
    nota: {
      conteudo: descriptografar(data.content_encrypted) || '',
      humor: data.mood_score,
      proximosPassos: data.next_steps || '',
    },
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { appointmentId, conteudo, humor, proximosPassos } = await request.json()
  if (!appointmentId) return NextResponse.json({ error: 'appointmentId é obrigatório' }, { status: 400 })

  const { data: psicologo } = await supabase
    .from('psychologists')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!psicologo) return NextResponse.json({ error: 'Só psicólogos podem salvar notas de sessão' }, { status: 403 })

  const { error } = await supabase.from('session_notes').upsert(
    {
      appointment_id: appointmentId,
      psychologist_id: psicologo.id,
      content_encrypted: criptografar(conteudo || null),
      mood_score: humor === '' || humor === null || humor === undefined ? null : humor,
      next_steps: proximosPassos || null,
    },
    { onConflict: 'appointment_id' }
  )

  if (error) {
    console.error('Erro ao salvar notas da sessão:', error)
    return NextResponse.json({ error: 'Não foi possível salvar as notas' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
