'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BadgeCheck, Clock, XCircle, Wallet, ShieldCheck } from 'lucide-react'
import Header from '@/components/Header'
import AvatarUpload from '@/components/AvatarUpload'
import AvailabilityManager from '@/components/AvailabilityManager'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { psychologistProfileSchema, type PsychologistProfileInput } from '@/lib/validation'
import { ESPECIALIDADES, ABORDAGENS, PRECO_SESSAO_PADRAO, type Psychologist, type PsychologistStatus } from '@/lib/types'
import { cn, formatarPreco, formatarCRP } from '@/lib/utils'

interface ErroSupabase {
  code?: string
  message?: string
}

/** Traduz os erros mais comuns do Postgres/PostgREST para algo que o psicólogo entenda. */
function mensagemDeErro(error: ErroSupabase): string {
  console.error('Erro ao salvar perfil do psicólogo:', error)

  if (error.code === '23505') {
    return 'Alguma informação já está cadastrada em outra conta.'
  }
  if (error.code === '42501') {
    return 'Você não tem permissão para salvar esse perfil. Faça login novamente e tente de novo.'
  }
  return 'Não foi possível salvar seu perfil. Tente novamente em instantes.'
}

export default function CompletarPerfilPsicologoPage() {
  const [userId, setUserId] = useState('')
  const [psicologo, setPsicologo] = useState<Psychologist | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PsychologistProfileInput>({
    resolver: zodResolver(psychologistProfileSchema),
    defaultValues: { specialties: [], approaches: [] },
  })

  const especialidadesSelecionadas = watch('specialties') || []
  const abordagensSelecionadas = watch('approaches') || []

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const profile = await ensureProfile(supabase, user)
      if (profile?.role !== 'psychologist') {
        router.push('/dashboard')
        return
      }
      if (!user.user_metadata?.terms_accepted_at) {
        router.push('/psicologo/termos')
        return
      }
      setFotoUrl(profile.avatar_url)

      const { data: psi } = await supabase
        .from('psychologists')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle()

      // Sem verificação concluída não existe perfil profissional para preencher:
      // quem ainda não enviou os documentos (ou foi rejeitado) volta para o
      // fluxo de verificação, que é onde os dados de identidade são tratados.
      const precisaVerificar =
        !psi || psi.status === 'pending_documents' || psi.status === 'pending' || psi.status === 'rejected'

      if (precisaVerificar) {
        router.push('/psicologo/verificacao')
        return
      }

      const registro = psi as Psychologist
      setPsicologo(registro)
      reset({
        specialties: registro.specialties || [],
        approaches: registro.approaches || [],
        bio: registro.bio || '',
      })

      setLoading(false)
    }
    carregar()
  }, [])

  function alternarItem(campo: 'specialties' | 'approaches', valor: string) {
    const atual = campo === 'specialties' ? especialidadesSelecionadas : abordagensSelecionadas
    if (atual.includes(valor)) {
      setValue(campo, atual.filter((e) => e !== valor), { shouldValidate: true })
    } else {
      setValue(campo, [...atual, valor], { shouldValidate: true })
    }
  }

  async function handleFotoEnviada(url: string) {
    setFotoUrl(url)
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
  }

  async function onSubmit(dados: PsychologistProfileInput) {
    if (!psicologo) return
    setErro('')
    setSucesso(false)

    const { error } = await supabase
      .from('psychologists')
      .update({
        specialties: dados.specialties,
        approaches: dados.approaches,
        bio: dados.bio,
        session_price: PRECO_SESSAO_PADRAO,
      })
      .eq('id', psicologo.id)

    if (error) { setErro(mensagemDeErro(error)); return }

    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </main>
    )
  }

  const status: PsychologistStatus | null = psicologo?.status ?? null

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/dashboard" />

      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        <div>
          <h2 className="text-3xl font-serif text-slate-800 mb-2">Meu perfil profissional</h2>
          <p className="text-slate-500 text-sm">
            Essas informações aparecem na sua página pública, vista pelos pacientes.
          </p>
        </div>

        {status === 'approved' && (
          <div className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-3 rounded-xl text-sm">
            <BadgeCheck className="w-4 h-4 flex-shrink-0" />
            Cadastro verificado. Seu perfil aparece na busca com o selo de psicólogo verificado.
          </div>
        )}
        {status === 'pending_review' && (
          <div className="flex items-start gap-2 bg-amber-50 text-amber-700 px-4 py-3 rounded-xl text-sm">
            <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Seus documentos estão em análise (prazo de até 48h úteis). Você já pode preencher o perfil abaixo —
              ele entra no ar assim que a verificação for aprovada.
            </span>
          </div>
        )}
        {status === 'suspended' && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            Sua conta foi suspensa pela equipe Pandorum. Entre em contato com o suporte para mais informações.
          </div>
        )}

        {sucesso && (
          <div className="bg-teal-50 text-teal-700 px-4 py-3 rounded-xl text-sm">
            Perfil salvo com sucesso!
          </div>
        )}
        {erro && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{erro}</div>}

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
          {userId && <AvatarUpload userId={userId} url={fotoUrl} onUploaded={handleFotoEnviada} />}

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Registro profissional</label>
            <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-600">
              <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
              {formatarCRP(psicologo?.crp_region ?? null, psicologo?.crp_number ?? null)}
              {status === 'approved' && <span className="text-xs text-teal-600">· verificado</span>}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              O CRP é conferido na verificação e não pode ser alterado depois.{' '}
              <Link href="/psicologo/verificacao" className="text-teal-700 hover:underline">
                Ver meus dados de verificação
              </Link>
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Especialidades</label>
            <div className="flex flex-wrap gap-2">
              {ESPECIALIDADES.map((esp) => (
                <button
                  type="button"
                  key={esp}
                  onClick={() => alternarItem('specialties', esp)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    especialidadesSelecionadas.includes(esp)
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'border-slate-200 text-slate-600 hover:border-teal-300'
                  )}
                >
                  {esp}
                </button>
              ))}
            </div>
            {errors.specialties && <p className="text-xs text-red-600 mt-1">{errors.specialties.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-2">Abordagens terapêuticas</label>
            <div className="flex flex-wrap gap-2">
              {ABORDAGENS.map((ab) => (
                <button
                  type="button"
                  key={ab}
                  onClick={() => alternarItem('approaches', ab)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    abordagensSelecionadas.includes(ab)
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'border-slate-200 text-slate-600 hover:border-teal-300'
                  )}
                >
                  {ab}
                </button>
              ))}
            </div>
            {errors.approaches && <p className="text-xs text-red-600 mt-1">{errors.approaches.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Bio</label>
            <textarea
              placeholder="Conte um pouco sobre sua abordagem e experiência..."
              rows={4}
              {...register('bio')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 resize-none"
            />
            {errors.bio && <p className="text-xs text-red-600 mt-1">{errors.bio.message}</p>}
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Valor da sessão</label>
            <div className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-600">
              <Wallet className="w-4 h-4 text-teal-600 flex-shrink-0" />
              Valor da sessão: {formatarPreco(PRECO_SESSAO_PADRAO)} (definido pela plataforma)
            </div>
            <p className="text-xs text-slate-400 mt-1">Sessões têm duração fixa de 50 minutos.</p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </form>

        {psicologo && <AvailabilityManager psychologistId={psicologo.id} />}
      </div>
    </main>
  )
}
