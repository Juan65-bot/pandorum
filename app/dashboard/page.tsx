'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Calendar, User, ShieldCheck, BadgeCheck, Clock, Video, CreditCard, ArrowRight } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { formatarDataHora, capitalizarNome, cn } from '@/lib/utils'
import { podeEntrarNaSala } from '@/lib/scheduling'
import type { Appointment, Profile, Role } from '@/lib/types'

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [realizadas, setRealizadas] = useState(0)
  const [agendadas, setAgendadas] = useState(0)
  const [proxima, setProxima] = useState<Appointment | null>(null)
  const [statusPsicologo, setStatusPsicologo] = useState<'pending' | 'approved' | 'rejected' | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const profileData = await ensureProfile(supabase, user)
      setProfile(profileData)
      const role: Role = profileData?.role || 'patient'

      let idFiltro: { coluna: string; valor: string } | null = null

      if (role === 'psychologist') {
        const { data: psi } = await supabase.from('psychologists').select('id, status').eq('profile_id', user.id).maybeSingle()
        if (psi) {
          idFiltro = { coluna: 'psychologist_id', valor: psi.id }
          setStatusPsicologo(psi.status)
        } else {
          setStatusPsicologo(null)
        }
      } else if (role === 'patient') {
        idFiltro = { coluna: 'patient_id', valor: user.id }
      }

      if (idFiltro) {
        const [{ count: countRealizadas }, { count: countAgendadas }, { data: next }] = await Promise.all([
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq(idFiltro.coluna, idFiltro.valor).eq('status', 'completed'),
          supabase.from('appointments').select('*', { count: 'exact', head: true }).eq(idFiltro.coluna, idFiltro.valor).eq('status', 'confirmed').gte('starts_at', new Date().toISOString()),
          supabase
            .from('appointments')
            .select('*, patients_profile:profiles!patient_id(*), psychologists(*, profiles!profile_id(*))')
            .eq(idFiltro.coluna, idFiltro.valor)
            .in('status', ['confirmed', 'scheduled'])
            .gte('starts_at', new Date().toISOString())
            .order('starts_at')
            .limit(1)
            .maybeSingle(),
        ])
        setRealizadas(countRealizadas || 0)
        setAgendadas(countAgendadas || 0)
        setProxima((next as unknown as Appointment) || null)
      }

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

  const role: Role = profile?.role || 'patient'
  const nomeCompleto = capitalizarNome(profile?.full_name) || 'Usuário'
  const outraParte = capitalizarNome(
    role === 'psychologist' ? proxima?.patients_profile?.full_name : proxima?.psychologists?.profiles?.full_name
  )
  const fotoOutraParte = role === 'psychologist' ? proxima?.patients_profile?.avatar_url : proxima?.psychologists?.profiles?.avatar_url

  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      <div className="max-w-4xl mx-auto px-8 py-10">
        <div className="bg-teal-700 rounded-2xl p-6 text-white mb-8 flex items-center gap-4">
          <span className="w-14 h-14 rounded-full bg-teal-600 flex items-center justify-center text-xl font-serif overflow-hidden flex-shrink-0 border-2 border-teal-400">
            {profile?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              nomeCompleto[0]
            )}
          </span>
          <div>
            <h2 className="text-2xl font-serif mb-1">
              Bem-vindo, {nomeCompleto.split(' ')[0]}!
            </h2>
            <p className="text-teal-100 text-sm">
              {role === 'psychologist'
                ? 'Gerencie seu perfil, horários e sessões com pacientes.'
                : role === 'admin'
                ? 'Acompanhe a operação da plataforma Pandorum.'
                : 'Sua plataforma de saúde mental está pronta para você.'}
            </p>
          </div>
        </div>

        {role === 'psychologist' && statusPsicologo === null && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm mb-8">
            <Clock className="w-4 h-4" />
            Complete seu perfil profissional para começar a receber pacientes.
          </div>
        )}
        {role === 'psychologist' && statusPsicologo === 'pending' && (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm mb-8">
            <Clock className="w-4 h-4" />
            Seu CRP ainda está em análise pela equipe Pandorum.
          </div>
        )}
        {role === 'psychologist' && statusPsicologo === 'rejected' && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-8">
            <Clock className="w-4 h-4" />
            Seu cadastro não foi aprovado. Revise seu perfil profissional.
          </div>
        )}

        {role !== 'admin' && (
          <>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="text-3xl font-serif text-slate-800">{realizadas}</div>
                <div className="text-sm text-slate-500 mt-1">Sessões realizadas</div>
              </div>
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="text-3xl font-serif text-slate-800">{agendadas}</div>
                <div className="text-sm text-slate-500 mt-1">Sessões agendadas</div>
              </div>
            </div>

            {/* PRÓXIMA SESSÃO EM DESTAQUE */}
            {proxima ? (
              <div className="rounded-2xl p-6 mb-8 bg-gradient-to-br from-teal-700 to-teal-800 text-white shadow-md flex items-center justify-between gap-6">
                <div className="flex items-center gap-4 min-w-0">
                  <span className="w-14 h-14 rounded-full bg-white/15 flex items-center justify-center text-lg font-serif overflow-hidden flex-shrink-0 border-2 border-white/30">
                    {fotoOutraParte ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={fotoOutraParte} alt="" className="w-full h-full object-cover" />
                    ) : (
                      outraParte[0] || '?'
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-wide text-teal-200 mb-0.5">Próxima sessão</p>
                    <p className="font-serif text-lg truncate">{outraParte || 'Sessão agendada'}</p>
                    <p className="text-sm text-teal-100">{formatarDataHora(proxima.starts_at)}</p>
                  </div>
                </div>

                {proxima.status === 'confirmed' ? (
                  <Link
                    href={`/sessoes/${proxima.id}/sala`}
                    className={cn(
                      'flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium flex-shrink-0 whitespace-nowrap',
                      podeEntrarNaSala(proxima.starts_at, proxima.ends_at)
                        ? 'bg-white text-teal-700 hover:bg-teal-50'
                        : 'bg-white/15 text-white/70 pointer-events-none'
                    )}
                  >
                    <Video className="w-4 h-4" />
                    Entrar na sessão
                  </Link>
                ) : role === 'patient' ? (
                  <Link
                    href={`/sessoes/${proxima.id}/pagamento`}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-medium bg-white text-teal-700 hover:bg-teal-50 flex-shrink-0 whitespace-nowrap"
                  >
                    <CreditCard className="w-4 h-4" />
                    Pagar agora
                  </Link>
                ) : (
                  <span className="text-xs text-teal-200 flex-shrink-0">Aguardando pagamento</span>
                )}
              </div>
            ) : (
              <div className="rounded-2xl p-6 mb-8 bg-white border border-dashed border-slate-200 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-700 mb-1">Nenhuma sessão agendada</p>
                  <p className="text-sm text-slate-400">
                    {role === 'psychologist' ? 'Suas próximas sessões vão aparecer aqui.' : 'Que tal agendar sua próxima sessão?'}
                  </p>
                </div>
                {role === 'patient' && (
                  <Link href="/psicologos" className="flex items-center gap-1.5 text-sm text-teal-700 font-medium hover:underline flex-shrink-0">
                    Buscar psicólogo <ArrowRight className="w-4 h-4" />
                  </Link>
                )}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-6">
          {role === 'patient' && (
            <>
              <AcaoCard
                icone={<Search className="w-5 h-5" />}
                titulo="Encontrar psicólogo"
                descricao="Busque entre nossos profissionais verificados"
                href="/psicologos"
                cta="Buscar agora"
              />
              <AcaoCard
                icone={<Calendar className="w-5 h-5" />}
                titulo="Minhas sessões"
                descricao="Veja seu histórico e próximas sessões"
                href="/sessoes"
                cta="Ver sessões"
                secundario
              />
              <AcaoCard
                icone={<User className="w-5 h-5" />}
                titulo="Meu perfil"
                descricao="Atualize seus dados pessoais"
                href="/perfil"
                cta="Editar perfil"
                secundario
              />
            </>
          )}

          {role === 'psychologist' && (
            <>
              <AcaoCard
                icone={<BadgeCheck className="w-5 h-5" />}
                titulo="Meu perfil profissional"
                descricao="CRP, especialidades, valor e horários de atendimento"
                href="/psicologo/completar-perfil"
                cta="Gerenciar perfil"
              />
              <AcaoCard
                icone={<User className="w-5 h-5" />}
                titulo="Meus pacientes"
                descricao="Veja quem você já atendeu e o histórico de cada um"
                href="/psicologo/pacientes"
                cta="Ver pacientes"
                secundario
              />
              <AcaoCard
                icone={<Calendar className="w-5 h-5" />}
                titulo="Minhas sessões"
                descricao="Veja suas sessões agendadas e concluídas"
                href="/sessoes"
                cta="Ver sessões"
                secundario
              />
            </>
          )}

          {role === 'admin' && (
            <AcaoCard
              icone={<ShieldCheck className="w-5 h-5" />}
              titulo="Painel administrativo"
              descricao="Verifique psicólogos e acompanhe a operação"
              href="/admin"
              cta="Abrir painel"
            />
          )}
        </div>
      </div>
    </main>
  )
}

function AcaoCard({
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
