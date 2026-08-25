'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import type { Appointment } from '@/lib/types'

const PsychologistCalendar = dynamic(() => import('@/components/PsychologistCalendar'), { ssr: false })

export default function AgendaPsicologoPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login?next=/psicologo/agenda'); return }

      const profile = await ensureProfile(supabase, user)
      if (profile?.role !== 'psychologist') { router.push('/dashboard'); return }

      const { data: psi } = await supabase.from('psychologists').select('id').eq('profile_id', user.id).maybeSingle()
      if (!psi) { setLoading(false); return }

      const { data } = await supabase
        .from('appointments')
        .select('*, patients_profile:profiles!patient_id(*)')
        .eq('psychologist_id', psi.id)
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true })

      setAppointments((data as unknown as Appointment[]) || [])
      setLoading(false)
    }
    carregar()
  }, [])

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/psicologo/dashboard" />

      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <h2 className="text-3xl font-serif text-slate-800 mb-2">Minha agenda</h2>
        <p className="text-slate-500 text-sm mb-8">Todas as suas sessões confirmadas e aguardando pagamento</p>

        {loading ? (
          <p className="text-sm text-slate-400">Carregando...</p>
        ) : (
          <PsychologistCalendar appointments={appointments} />
        )}
      </div>
    </main>
  )
}
