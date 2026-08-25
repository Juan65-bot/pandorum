'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wallet,
  CalendarDays,
  Users,
  Clock,
  Video,
  CreditCard,
  BadgeCheck,
  CalendarClock,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { podeEntrarNaSala } from '@/lib/scheduling'
import { formatarHora, formatarData, formatarPreco, capitalizarNome, cn } from '@/lib/utils'
import type { Appointment, Profile, PsychologistStatus } from '@/lib/types'

interface PacientePreview {
  profile: Profile
  totalSessoes: number
  ultimaAtividade: string
}

export default function DashboardPsicologoPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [statusPsicologo, setStatusPsicologo] = useState<PsychologistStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [hoje, setHoje] = useState<Appointment[]>([])
  const [proximas, setProximas] = useState<Appointment[]>([])
  const [pacientes, setPacientes] = useState<PacientePreview[]>([])
  const [totalPacientes, setTotalPacientes] = useState(0)
  const [sessoesMes, setSessoesMes] = useState(0)
  const [receitaMes, setReceitaMes] = useState(0)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const profileData = await ensureProfile(supabase, user)
      if (profileData?.role !== 'psychologist') { router.push('/dashboard'); return }
      setProfile(profileData)

      const { data: psi } = await supabase
        .from('psychologists')
        .select('id, status')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (!psi) { setLoading(false); return }
      setStatusPsicologo(psi.status)

      const inicioHoje = new Date()
      inicioHoje.setHours(0, 0, 0, 0)
      const fimHoje = new Date(inicioHoje)
      fimHoje.setDate(fimHoje.getDate() + 1)
      const inicioMes = new Date()
      inicioMes.setDate(1)
      inicioMes.setHours(0, 0, 0, 0)

      const [{ data: appointments }, { data: pagos }] = await Promise.all([
        supabase
          .from('appointments')
          .select('*, patients_profile:profiles!patient_id(*)')
          .eq('psychologist_id', psi.id)
          .order('starts_at', { ascending: true }),
        supabase
          .from('payments')
          .select('psy_payout')
          .eq('psychologist_id', psi.id)
          .eq('status', 'paid')
          .gte('paid_at', inicioMes.toISOString()),
      ])

      setReceitaMes((pagos || []).reduce((soma, p) => soma + Number(p.psy_payout), 0))

      const todas = (appointments as unknown as Appointment[]) || []
      const ativas = todas.filter((a) => a.status !== 'cancelled')

      setHoje(
        ativas.filter((a) => {
          const d = new Date(a.starts_at)
          return d >= inicioHoje && d < fimHoje
        })
      )

      setProximas(
        ativas
          .filter((a) => new Date(a.starts_at) >= fimHoje && (a.status === 'confirmed' || a.status === 'scheduled'))
          .slice(0, 5)
      )

      setSessoesMes(ativas.filter((a) => new Date(a.starts_at) >= inicioMes).length)

      const porPaciente = new Map<string, PacientePreview>()
      for (const a of ativas) {
        if (!a.patients_profile) continue
        const atual = porPaciente.get(a.patient_id)
        if (atual) {
          atual.totalSessoes += 1
          if (a.starts_at > atual.ultimaAtividade) atual.ultimaAtividade = a.starts_at
        } else {
          porPaciente.set(a.patient_id, { profile: a.patients_profile, totalSessoes: 1, ultimaAtividade: a.starts_at })
        }
      }
      const listaPacientes = Array.from(porPaciente.values()).sort((a, b) => b.ultimaAtividade.localeCompare(a.ultimaAtividade))
      setTotalPacientes(listaPacientes.length)
      setPacientes(listaPacientes.slice(0, 6))

      setLoading(false)
    }
    carregar()
  }, [])

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-500 text-sm">Carregando...</p>
      </main>
    )
  }

  const nome = capitalizarNome(profile?.full_name) || 'Psicólogo'

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="max-w-4xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <div className="bg-teal-700 rounded-2xl p-6 text-white mb-8 flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center text-xl font-serif overflow-hidden flex-shrink-0 border-2 border-teal-400">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              nome[0]
            )}
          </span>
          <div>
            <h2 className="text-2xl font-serif mb-1">Bem-vindo, {nome.split(' ')[0]}!</h2>
            <p className="text-teal-100 text-sm">Gerencie sua agenda, pacientes e receita em um só lugar.</p>
          </div>
        </div>

        {(statusPsicologo === null || statusPsicologo === 'pending_documents' || statusPsicologo === 'pending') && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm mb-8">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            Conclua sua verificação profissional para começar a receber pacientes.
            <Link href="/psicologo/verificacao" className="underline font-medium ml-auto flex-shrink-0">Verificar agora</Link>
          </div>
        )}
        {statusPsicologo === 'pending_review' && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm mb-8">
            <Clock className="w-4 h-4 flex-shrink-0" />
            Seus documentos estão em análise. O prazo é de até 48h úteis e você recebe um e-mail com a decisão.
            <Link href="/psicologo/verificacao" className="underline font-medium ml-auto flex-shrink-0">Acompanhar</Link>
          </div>
        )}
        {statusPsicologo === 'rejected' && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-8">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            Seu cadastro não foi aprovado. Veja o motivo e reenvie seus documentos.
            <Link href="/psicologo/verificacao" className="underline font-medium ml-auto flex-shrink-0">Ver motivo</Link>
          </div>
        )}
        {statusPsicologo === 'suspended' && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-8">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            Sua conta foi suspensa pela equipe Pandorum. Entre em contato com o suporte.
          </div>
        )}

        {/* STATS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Wallet className="w-4 h-4" /><span className="text-xs">Receita este mês</span></div>
            <div className="text-2xl font-serif text-slate-800">{formatarPreco(receitaMes)}</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><CalendarDays className="w-4 h-4" /><span className="text-xs">Sessões este mês</span></div>
            <div className="text-2xl font-serif text-slate-800">{sessoesMes}</div>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-1.5 text-slate-400 mb-2"><Users className="w-4 h-4" /><span className="text-xs">Pacientes atendidos</span></div>
            <div className="text-2xl font-serif text-slate-800">{totalPacientes}</div>
          </div>
        </div>

        {/* AGENDA DE HOJE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h3 className="font-medium text-slate-800 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-teal-600" />
              Agenda de hoje
            </h3>
            <span className="text-xs text-slate-400">{formatarData(new Date())}</span>
          </div>
          {hoje.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 pb-6">Nenhuma sessão marcada para hoje.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {hoje.map((a) => {
                const nomePaciente = capitalizarNome(a.patients_profile?.full_name) || 'Paciente'
                const podeEntrar = a.status === 'confirmed' && podeEntrarNaSala(a.starts_at, a.ends_at)
                return (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-sm font-medium text-slate-700 w-12 flex-shrink-0 font-mono">{formatarHora(a.starts_at)}</span>
                      <span className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium overflow-hidden flex-shrink-0">
                        {a.patients_profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.patients_profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          nomePaciente[0]
                        )}
                      </span>
                      <span className="text-sm text-slate-700 truncate">{nomePaciente}</span>
                    </div>
                    {a.status === 'confirmed' ? (
                      <Link
                        href={`/sessoes/${a.id}/sala`}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs flex-shrink-0',
                          podeEntrar ? 'bg-teal-700 text-white hover:bg-teal-800' : 'bg-slate-100 text-slate-400 pointer-events-none'
                        )}
                      >
                        <Video className="w-3.5 h-3.5" />
                        {podeEntrar ? 'Entrar' : 'Aguardando horário'}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-amber-600 flex-shrink-0">
                        <CreditCard className="w-3.5 h-3.5" />
                        Aguardando pagamento
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* PRÓXIMAS SESSÕES */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h3 className="font-medium text-slate-800 flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-teal-600" />
              Próximas sessões
            </h3>
            <Link href="/psicologo/agenda" className="text-xs text-teal-700 hover:underline flex items-center gap-1">
              Ver agenda completa <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {proximas.length === 0 ? (
            <p className="text-sm text-slate-400 px-6 pb-6">Nenhuma sessão futura confirmada ainda.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {proximas.map((a) => {
                const nomePaciente = capitalizarNome(a.patients_profile?.full_name) || 'Paciente'
                return (
                  <div key={a.id} className="flex items-center justify-between gap-4 px-6 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium overflow-hidden flex-shrink-0">
                        {a.patients_profile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.patients_profile.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          nomePaciente[0]
                        )}
                      </span>
                      <span className="text-sm text-slate-700 truncate">{nomePaciente}</span>
                    </div>
                    <span className="text-xs text-slate-500 flex-shrink-0">{formatarData(a.starts_at)} às {formatarHora(a.starts_at)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* MEUS PACIENTES */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-slate-800 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-teal-600" />
              Meus pacientes
            </h3>
            <Link href="/psicologo/pacientes" className="text-xs text-teal-700 hover:underline flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {pacientes.length === 0 ? (
            <p className="text-sm text-slate-400">Você ainda não teve nenhuma sessão com paciente.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {pacientes.map((p) => {
                const nomePaciente = capitalizarNome(p.profile.full_name) || 'Paciente'
                return (
                  <div key={p.profile.id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2.5">
                    <span className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium overflow-hidden flex-shrink-0">
                      {p.profile.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        nomePaciente[0]
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{nomePaciente}</p>
                      <p className="text-[11px] text-slate-400">{p.totalSessoes} sessão{p.totalSessoes !== 1 ? 'ões' : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ATALHOS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <AtalhoCard icone={<CalendarDays className="w-5 h-5" />} titulo="Agenda" descricao="Veja sua semana e seus horários livres" href="/psicologo/agenda" cta="Abrir agenda" />
          <AtalhoCard icone={<Users className="w-5 h-5" />} titulo="Pacientes" descricao="Histórico completo de quem você atende" href="/psicologo/pacientes" cta="Ver pacientes" secundario />
          <AtalhoCard icone={<BadgeCheck className="w-5 h-5" />} titulo="Perfil profissional" descricao="Especialidades, abordagens e bio" href="/psicologo/completar-perfil" cta="Gerenciar perfil" secundario />
          <AtalhoCard icone={<ShieldCheck className="w-5 h-5" />} titulo="Verificação profissional" descricao="CRP, documentos e status da análise" href="/psicologo/verificacao" cta="Ver verificação" secundario />
        </div>
      </div>
    </main>
  )
}

function AtalhoCard({
  icone,
  titulo,
  descricao,
  href,
  cta,
  secundario,
}: {
  icone: React.ReactNode
  titulo: string
  descricao: string
  href: string
  cta: string
  secundario?: boolean
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <div className="text-teal-600 mb-3">{icone}</div>
      <h3 className="font-medium text-slate-800 mb-2">{titulo}</h3>
      <p className="text-sm text-slate-500 mb-4">{descricao}</p>
      <Link
        href={href}
        className={
          secundario
            ? 'inline-block px-5 py-2 border border-teal-200 text-teal-700 text-sm rounded-full hover:bg-teal-50'
            : 'inline-block px-5 py-2 bg-teal-700 text-white text-sm rounded-full hover:bg-teal-800'
        }
      >
        {cta}
      </Link>
    </div>
  )
}
