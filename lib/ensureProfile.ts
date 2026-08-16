import type { SupabaseClient, User } from '@supabase/supabase-js'
import type { Profile } from '@/lib/types'

/**
 * Busca o profile do usuário autenticado e, se por algum motivo ele não existir
 * (ex.: o trigger on_auth_user_created falhou ou ainda não foi aplicado),
 * cria na hora — rede de segurança para nunca deixar um usuário "órfão" sem
 * profile, o que quebraria qualquer insert em patients/psychologists/appointments.
 */
export async function ensureProfile(supabase: SupabaseClient, user: User): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle()
  if (data) return data as Profile

  const { data: criado } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        role: user.user_metadata?.role || 'patient',
      },
      { onConflict: 'id' }
    )
    .select('*')
    .single()

  return (criado as Profile) ?? null
}
