'use client'
import { useEffect, useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { podeEntrarNaSala } from '@/lib/scheduling'
import { formatarDataHora } from '@/lib/utils'
import VideoRoom from '@/components/VideoRoom'
import type { Appointment, Role } from '@/lib/types'

export default function SalaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [role, setRole] = useState<Role>('patient')
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push(`/auth/login?next=/sessoes/${id}/sala`); return }
      setUserId(user.id)

      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setRole((profile?.role as Role) || 'patient')

      const { data } = await supabase
        .from('appointments')
        .select('*, patients_profile:profiles!patient_id(*), psychologists(*, profiles!profile_id(*))')
        .eq('id', id)
        .maybeSingle()

      if (!data) { setErro('Sessão não encontrada'); setLoading(false); return }

      const agendamento = data as unknown as Appointment

      if (agendamento.status !== 'confirmed') {
        setErro('Essa sessão ainda não foi confirmada (verifique o pagamento).')
        setLoading(false)
        return
      }

      if (!podeEntrarNaSala(agendamento.starts_at, agendamento.ends_at)) {
        setErro(`A sala libera 10 minutos antes do horário marcado: ${formatarDataHora(agendamento.starts_at)}.`)
        setLoading(false)
        return
      }

      setAppointment(agendamento)
      setLoading(false)
    }
    carregar()
  }, [id])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-900">
        <p className="text-slate-400 text-sm">Carregando sala...</p>
      </main>
    )
  }

  if (erro || !appointment) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4 px-4 text-center">
        <p className="text-slate-600 text-sm">{erro}</p>
        <Link href="/sessoes" className="text-teal-700 text-sm hover:underline">Voltar para minhas sessões</Link>
      </main>
    )
  }

  const outraPessoa =
    role === 'psychologist' ? appointment.patients_profile?.full_name : appointment.psychologists?.profiles?.full_name

  return (
    <VideoRoom
      salaId={appointment.id}
      meuId={userId}
      souIniciador={role === 'patient'}
      outraPessoa={outraPessoa || ''}
    />
  )
}
