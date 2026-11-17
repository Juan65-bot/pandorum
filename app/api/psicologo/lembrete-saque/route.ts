import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PREFERENCIAS_LEMBRETE_SAQUE, type PreferenciaLembreteSaque } from '@/lib/types'

const VALIDAS = PREFERENCIAS_LEMBRETE_SAQUE.map((p) => p.valor)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

  const { preferencia } = (await request.json()) as { preferencia?: PreferenciaLembreteSaque }

  if (!preferencia || !VALIDAS.includes(preferencia)) {
    return NextResponse.json({ error: 'Preferência inválida' }, { status: 400 })
  }

  // A RLS de psychologists já restringe o update ao próprio registro, e
  // withdrawal_reminder não está entre os campos congelados pelos triggers de
  // proteção — é preferência do próprio profissional, não dado de verificação.
  const { error } = await supabase
    .from('psychologists')
    .update({ withdrawal_reminder: preferencia })
    .eq('profile_id', user.id)

  if (error) {
    console.error('Erro ao salvar preferência de lembrete:', error)
    return NextResponse.json({ error: 'Não foi possível salvar sua preferência.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, preferencia })
}
