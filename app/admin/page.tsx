'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Users, BadgeCheck, CalendarCheck, Wallet, Percent, Clock, ArrowRight } from 'lucide-react'
import StatusBadge from '@/components/admin/StatusBadge'
import { createClient } from '@/lib/supabase/client'
import { formatarPreco, formatarDataHora, capitalizarNome } from '@/lib/utils'
import { TAXA_PLATAFORMA } from '@/lib/stripe'
import type { Appointment, Psychologist } from '@/lib/types'

interface Metricas {
  pacientesAtivos: number
  psicologosAprovados: number
  sessoesRealizadas: number
  sessoesPendentes: number
  receitaTotal: number
  comissaoTotal: number
}

export default function AdminOverviewPage() {
  const [metricas, setMetricas] = useState<Metricas | null>(null)
  const [pendentes, setPendentes] = useState<Psychologist[]>([])
  const [recentes, setRecentes] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  async function carregar() {
    const [
      { count: pacientesAtivos },
      { count: psicologosAprovados },
      { count: sessoesRealizadas },
      { count: sessoesPendentes },
      { data: pagos },
      { data: pend },
      { data: rec },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'patient').eq('is_active', true),
      supabase.from('psychologists').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'completed'),
      supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('status', 'scheduled'),
      supabase.from('payments').select('amount_total, platform_fee').eq('status', 'paid'),
      supabase.from('psychologists').select('*, profiles!profile_id(*)').eq('status', 'pending').limit(5),
      supabase
        .from('appointments')
        .select('*, patients_profile:profiles!patient_id(*), psychologists(*, profiles!profile_id(*))')
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    setMetricas({
      pacientesAtivos: pacientesAtivos || 0,
      psicologosAprovados: psicologosAprovados || 0,
      sessoesRealizadas: sessoesRealizadas || 0,
      sessoesPendentes: sessoesPendentes || 0,
      receitaTotal: (pagos || []).reduce((s, p) => s + Number(p.amount_total), 0),
      comissaoTotal: (pagos || []).reduce((s, p) => s + Number(p.platform_fee), 0),
    })
    setPendentes((pend as unknown as Psychologist[]) || [])
    setRecentes((rec as unknown as Appointment[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  async function aprovarRapido(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('psychologists').update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: user?.id }).eq('id', id)
    carregar()
  }

  if (loading || !metricas) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="px-6 md:px-10 py-8 md:py-10 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-1">Visão geral</h1>
        <p className="text-slate-500 text-sm">Métricas gerais da plataforma Pandorum</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        <MetricCard icon={<Users className="w-4 h-4" />} label="Pacientes ativos" valor={metricas.pacientesAtivos} />
        <MetricCard icon={<BadgeCheck className="w-4 h-4" />} label="Psicólogos aprovados" valor={metricas.psicologosAprovados} />
        <MetricCard icon={<CalendarCheck className="w-4 h-4" />} label="Sessões realizadas" valor={metricas.sessoesRealizadas} />
        <MetricCard icon={<Wallet className="w-4 h-4" />} label="Receita total" valor={formatarPreco(metricas.receitaTotal)} destaque />
        <MetricCard
          icon={<Percent className="w-4 h-4" />}
          label={`Comissão da plataforma (${Math.round(TAXA_PLATAFORMA * 100)}%)`}
          valor={formatarPreco(metricas.comissaoTotal)}
          cor="purple"
        />
        <MetricCard icon={<Clock className="w-4 h-4" />} label="Sessões pendentes" valor={metricas.sessoesPendentes} cor="amber" />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h2 className="font-medium text-slate-800 text-sm">Psicólogos aguardando verificação</h2>
            <Link href="/admin/psicologos" className="text-xs text-teal-700 hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {pendentes.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 pb-6">Nenhuma verificação pendente.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendentes.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{capitalizarNome(p.profiles?.full_name)}</p>
                    <p className="text-xs text-slate-400">CRP {p.crp_number}</p>
                  </div>
                  <button
                    onClick={() => aprovarRapido(p.id)}
                    className="flex-shrink-0 px-3 py-1.5 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800"
                  >
                    Aprovar
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h2 className="font-medium text-slate-800 text-sm">Sessões recentes</h2>
            <Link href="/admin/sessoes" className="text-xs text-teal-700 hover:underline flex items-center gap-1">
              Ver todas <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {recentes.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 pb-6">Nenhuma sessão ainda.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentes.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 px-6 py-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">
                      {capitalizarNome(a.patients_profile?.full_name)} → {capitalizarNome(a.psychologists?.profiles?.full_name)}
                    </p>
                    <p className="text-xs text-slate-400">{formatarDataHora(a.starts_at)}</p>
                  </div>
                  <StatusBadge tipo="sessao" valor={a.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function MetricCard({
  icon,
  label,
  valor,
  destaque,
  cor,
}: {
  icon: React.ReactNode
  label: string
  valor: string | number
  destaque?: boolean
  cor?: 'purple' | 'amber'
}) {
  return (
    <div className={`rounded-2xl p-5 shadow-sm border ${destaque ? 'bg-teal-700 border-teal-700 text-white' : 'bg-white border-slate-100'}`}>
      <div className={`flex items-center gap-1.5 mb-2 text-xs ${destaque ? 'text-teal-100' : cor === 'purple' ? 'text-purple-500' : cor === 'amber' ? 'text-amber-500' : 'text-slate-400'}`}>
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-xl md:text-2xl font-serif ${destaque ? 'text-white' : 'text-slate-800'}`}>{valor}</div>
    </div>
  )
}
