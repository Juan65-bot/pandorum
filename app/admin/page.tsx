'use client'
import { useEffect, useState } from 'react'
import { BadgeCheck, XCircle, Users, Calendar, Wallet, Clock } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { formatarDataHora, formatarPreco } from '@/lib/utils'
import type { Appointment, Psychologist } from '@/lib/types'

export default function AdminPage() {
  const [pendentes, setPendentes] = useState<Psychologist[]>([])
  const [recentes, setRecentes] = useState<Appointment[]>([])
  const [stats, setStats] = useState({ pacientes: 0, psicologos: 0, sessoes: 0, receita: 0, comissao: 0 })
  const [loading, setLoading] = useState(true)
  const [adminId, setAdminId] = useState('')
  const supabase = createClient()

  async function carregar() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setAdminId(user.id)

    const [{ data: pend }, { data: rec }, { count: pacientes }, { count: psicologos }, { count: sessoes }, { data: pagos }] =
      await Promise.all([
        supabase.from('psychologists').select('*, profiles!profile_id(*)').eq('status', 'pending'),
        supabase
          .from('appointments')
          .select('*, patients_profile:profiles!patient_id(*), psychologists(*, profiles!profile_id(*))')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('patients').select('*', { count: 'exact', head: true }),
        supabase.from('psychologists').select('*', { count: 'exact', head: true }),
        supabase.from('appointments').select('*', { count: 'exact', head: true }),
        supabase.from('payments').select('amount_total, platform_fee').eq('status', 'paid'),
      ])

    setPendentes((pend as unknown as Psychologist[]) || [])
    setRecentes((rec as unknown as Appointment[]) || [])
    setStats({
      pacientes: pacientes || 0,
      psicologos: psicologos || 0,
      sessoes: sessoes || 0,
      receita: (pagos || []).reduce((soma, p) => soma + Number(p.amount_total), 0),
      comissao: (pagos || []).reduce((soma, p) => soma + Number(p.platform_fee), 0),
    })
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  async function aprovar(id: string) {
    await supabase
      .from('psychologists')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: adminId })
      .eq('id', id)
    carregar()
  }

  async function rejeitar(id: string) {
    await supabase
      .from('psychologists')
      .update({ status: 'rejected', approved_at: new Date().toISOString(), approved_by: adminId })
      .eq('id', id)
    carregar()
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/dashboard" />

      <div className="max-w-4xl mx-auto px-8 py-10 space-y-10">
        <div>
          <h2 className="text-3xl font-serif text-slate-800 mb-2">Painel administrativo</h2>
          <p className="text-slate-500 text-sm">Visão geral da plataforma</p>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard icon={<Users className="w-4 h-4" />} label="Pacientes" valor={stats.pacientes} />
          <StatCard icon={<BadgeCheck className="w-4 h-4" />} label="Psicólogos" valor={stats.psicologos} />
          <StatCard icon={<Calendar className="w-4 h-4" />} label="Sessões" valor={stats.sessoes} />
          <StatCard icon={<Wallet className="w-4 h-4" />} label="Receita paga" valor={formatarPreco(stats.receita)} />
        </div>
        <p className="text-xs text-slate-400 -mt-8">Comissão da plataforma (15%): {formatarPreco(stats.comissao)}</p>

        <section>
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <Clock className="w-4 h-4" />
            Psicólogos aguardando verificação de CRP
          </h3>
          {pendentes.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma verificação pendente.</p>
          ) : (
            <div className="space-y-3">
              {pendentes.map((p) => (
                <div key={p.id} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-slate-800">{p.profiles?.full_name}</p>
                    <p className="text-sm text-slate-500">CRP {p.crp_number} · {p.profiles?.email}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => rejeitar(p.id)}
                      className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-xs rounded-full hover:bg-red-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Rejeitar
                    </button>
                    <button
                      onClick={() => aprovar(p.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800"
                    >
                      <BadgeCheck className="w-3.5 h-3.5" />
                      Aprovar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Sessões recentes</h3>
          {recentes.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhuma sessão ainda.</p>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-100">
              {recentes.map((a) => (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-slate-800">{a.patients_profile?.full_name}</span>
                    <span className="text-slate-400"> → </span>
                    <span className="text-slate-800">{a.psychologists?.profiles?.full_name}</span>
                  </div>
                  <div className="text-slate-500">{formatarDataHora(a.starts_at)}</div>
                  <div className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{a.status}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function StatCard({ icon, label, valor }: { icon: React.ReactNode; label: string; valor: string | number }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-center gap-1.5 text-slate-400 mb-2">{icon}<span className="text-xs">{label}</span></div>
      <div className="text-xl font-serif text-slate-800">{valor}</div>
    </div>
  )
}
