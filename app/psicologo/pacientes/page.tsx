'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Calendar, Wallet } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { formatarData, formatarPreco, capitalizarNome } from '@/lib/utils'
import type { Appointment, Profile } from '@/lib/types'

interface ResumoPaciente {
  profile: Profile
  totalSessoes: number
  sessoesConcluidas: number
  ultimaSessao: string | null
  proximaSessao: string | null
}

export default function PacientesPsicologoPage() {
  const [resumos, setResumos] = useState<ResumoPaciente[]>([])
  const [receitaMes, setReceitaMes] = useState(0)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const profile = await ensureProfile(supabase, user)
      if (profile?.role !== 'psychologist') { router.push('/dashboard'); return }

      const { data: psi } = await supabase.from('psychologists').select('id').eq('profile_id', user.id).maybeSingle()
      if (!psi) { setLoading(false); return }

      const inicioMes = new Date()
      inicioMes.setDate(1)
      inicioMes.setHours(0, 0, 0, 0)

      const [{ data: appointments }, { data: pagos }] = await Promise.all([
        supabase
          .from('appointments')
          .select('*, patients_profile:profiles!patient_id(*)')
          .eq('psychologist_id', psi.id)
          .order('starts_at', { ascending: false }),
        supabase
          .from('payments')
          .select('psy_payout, paid_at')
          .eq('psychologist_id', psi.id)
          .eq('status', 'paid')
          .gte('paid_at', inicioMes.toISOString()),
      ])

      setReceitaMes((pagos || []).reduce((soma, p) => soma + Number(p.psy_payout), 0))

      const agrupado = new Map<string, ResumoPaciente>()
      const agora = new Date()

      for (const a of (appointments as unknown as Appointment[]) || []) {
        if (!a.patients_profile) continue
        const existente = agrupado.get(a.patient_id)
        const registro: ResumoPaciente = existente || {
          profile: a.patients_profile,
          totalSessoes: 0,
          sessoesConcluidas: 0,
          ultimaSessao: null,
          proximaSessao: null,
        }

        if (a.status !== 'cancelled') registro.totalSessoes += 1
        if (a.status === 'completed') registro.sessoesConcluidas += 1

        const dataSessao = new Date(a.starts_at)
        if (dataSessao <= agora && (a.status === 'completed' || a.status === 'confirmed')) {
          if (!registro.ultimaSessao || dataSessao > new Date(registro.ultimaSessao)) registro.ultimaSessao = a.starts_at
        }
        if (dataSessao > agora && (a.status === 'confirmed' || a.status === 'scheduled')) {
          if (!registro.proximaSessao || dataSessao < new Date(registro.proximaSessao)) registro.proximaSessao = a.starts_at
        }

        agrupado.set(a.patient_id, registro)
      }

      setResumos(Array.from(agrupado.values()).sort((a, b) => (b.ultimaSessao || '').localeCompare(a.ultimaSessao || '')))
      setLoading(false)
    }
    carregar()
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/psicologo/dashboard" />

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <h2 className="text-3xl font-serif text-slate-800 mb-2">Meus pacientes</h2>
        <p className="text-slate-500 text-sm mb-8">Histórico de quem você já atendeu pelo Pandorum</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Users className="w-4 h-4" /><span className="text-xs">Pacientes atendidos</span></div>
            <div className="text-2xl font-serif text-slate-800">{resumos.length}</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Wallet className="w-4 h-4" /><span className="text-xs">Receita este mês</span></div>
            <div className="text-2xl font-serif text-slate-800">{formatarPreco(receitaMes)}</div>
          </div>
        </div>

        {resumos.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm">Você ainda não teve nenhuma sessão com paciente.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
            {resumos.map((r) => {
              const nome = capitalizarNome(r.profile.full_name) || 'Paciente'
              return (
                <div key={r.profile.id} className="p-5 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-11 h-11 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium overflow-hidden flex-shrink-0">
                      {r.profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.profile.avatar_url} alt={nome} className="w-full h-full object-cover" />
                      ) : (
                        nome[0]
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-slate-800 truncate">{nome}</p>
                      <p className="text-xs text-slate-400">{r.profile.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-xs text-slate-500 flex-shrink-0">
                    <div className="text-center">
                      <div className="font-medium text-slate-800">{r.sessoesConcluidas}</div>
                      <div>concluídas</div>
                    </div>
                    <div className="hidden sm:block">
                      {r.proximaSessao ? (
                        <span className="flex items-center gap-1 text-teal-700">
                          <Calendar className="w-3.5 h-3.5" />
                          Próxima: {formatarData(r.proximaSessao)}
                        </span>
                      ) : r.ultimaSessao ? (
                        <span>Última sessão: {formatarData(r.ultimaSessao)}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
