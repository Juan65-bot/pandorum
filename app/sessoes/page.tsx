'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { List, CalendarDays } from 'lucide-react'
import Header from '@/components/Header'
import SessionCard from '@/components/SessionCard'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Appointment, Role } from '@/lib/types'

const PsychologistCalendar = dynamic(() => import('@/components/PsychologistCalendar'), { ssr: false })

export default function SessoesPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [role, setRole] = useState<Role>('patient')
  const [loading, setLoading] = useState(true)
  const [visao, setVisao] = useState<'lista' | 'calendario'>('lista')
  const router = useRouter()
  const supabase = createClient()

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login?next=/sessoes'); return }

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    const papel = (profile?.role as Role) || 'patient'
    setRole(papel)

    let query = supabase
      .from('appointments')
      .select('*, patients_profile:profiles!patient_id(*), psychologists(*, profiles!profile_id(*))')
      .order('starts_at', { ascending: false })

    if (papel === 'psychologist') {
      const { data: psi } = await supabase.from('psychologists').select('id').eq('profile_id', user.id).single()
      query = query.eq('psychologist_id', psi?.id || '')
    } else {
      query = query.eq('patient_id', user.id)
    }

    const { data } = await query
    setAppointments((data as unknown as Appointment[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  const agora = new Date()
  const proximas = appointments.filter(
    (a) => new Date(a.starts_at) >= agora && ['scheduled', 'confirmed'].includes(a.status)
  )
  const historico = appointments.filter(
    (a) => new Date(a.starts_at) < agora || ['completed', 'cancelled'].includes(a.status)
  )

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/dashboard" />

      <div className={cn('mx-auto px-8 py-10', visao === 'calendario' ? 'max-w-5xl' : 'max-w-3xl')}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-3xl font-serif text-slate-800">Minhas sessões</h2>
          {role === 'psychologist' && (
            <div className="flex gap-1 bg-white border border-slate-200 rounded-full p-1">
              <button
                onClick={() => setVisao('lista')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs', visao === 'lista' ? 'bg-teal-700 text-white' : 'text-slate-500')}
              >
                <List className="w-3.5 h-3.5" /> Lista
              </button>
              <button
                onClick={() => setVisao('calendario')}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs', visao === 'calendario' ? 'bg-teal-700 text-white' : 'text-slate-500')}
              >
                <CalendarDays className="w-3.5 h-3.5" /> Calendário
              </button>
            </div>
          )}
        </div>
        <p className="text-slate-500 text-sm mb-8">
          {role === 'psychologist' ? 'Sessões com seus pacientes' : 'Seu histórico e próximas sessões'}
        </p>

        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : visao === 'calendario' ? (
          <PsychologistCalendar appointments={appointments} />
        ) : (
          <div className="space-y-10">
            <section>
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Próximas</h3>
              {proximas.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma sessão agendada.</p>
              ) : (
                <div className="space-y-3">
                  {proximas.map((a) => (
                    <SessionCard
                      key={a.id}
                      appointment={a}
                      role={role}
                      precoSessao={a.psychologists?.session_price ?? undefined}
                      onChange={carregar}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Histórico</h3>
              {historico.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma sessão anterior.</p>
              ) : (
                <div className="space-y-3">
                  {historico.map((a) => (
                    <SessionCard
                      key={a.id}
                      appointment={a}
                      role={role}
                      precoSessao={a.psychologists?.session_price ?? undefined}
                      onChange={carregar}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  )
}
