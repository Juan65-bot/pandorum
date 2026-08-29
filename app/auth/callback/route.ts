import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * Aterrissagem dos links enviados por e-mail (confirmação de cadastro, convite).
 *
 * O Supabase devolve o token de três formas diferentes conforme o fluxo:
 *   • "?code="       — PKCE, trocado por sessão aqui no servidor
 *   • "?token_hash=" — link com template {{ .TokenHash }}, verificado aqui
 *   • "#access_token=" — fluxo implícito, no FRAGMENTO da URL
 *
 * O terceiro caso é o que não tem jeito de tratar aqui: o navegador nunca manda
 * o fragmento para o servidor, então esta rota enxerga a query vazia e não tem
 * como saber que existe uma sessão válida logo ali. Por isso a recuperação de
 * senha não passa mais por aqui — ela aponta direto para /auth/redefinir-senha,
 * onde o cliente do browser lê o fragmento sozinho.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'
  const erroSupabase = searchParams.get('error_description') || searchParams.get('error')

  if (erroSupabase) {
    console.error('Callback de auth recebeu erro do Supabase:', erroSupabase)
    return NextResponse.redirect(`${origin}/auth/login?erro=link_invalido`)
  }

  const supabase = await createClient()

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    console.error('Falha ao trocar code por sessão:', error.message)
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    console.error('Falha ao verificar token_hash:', error.message)
  }

  return NextResponse.redirect(`${origin}/auth/login?erro=link_invalido`)
}
