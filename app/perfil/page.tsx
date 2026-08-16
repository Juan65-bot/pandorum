'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import AvatarUpload from '@/components/AvatarUpload'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { patientProfileSchema, type PatientProfileInput } from '@/lib/validation'
import { capitalizarNome } from '@/lib/utils'
import type { Profile } from '@/lib/types'

export default function PerfilPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sucesso, setSucesso] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PatientProfileInput>({ resolver: zodResolver(patientProfileSchema) })

  useEffect(() => {
    async function getProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const data = await ensureProfile(supabase, user)

      if (data?.role === 'psychologist') {
        router.push('/psicologo/completar-perfil')
        return
      }

      setProfile(data)

      const { data: patient } = await supabase
        .from('patients')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle()

      reset({
        telefone: data?.phone || '',
        nascimento: patient?.birth_date || '',
        genero: patient?.gender || '',
        queixa: patient?.main_complaint || '',
      })

      setLoading(false)
    }
    getProfile()
  }, [])

  async function onSubmit(dados: PatientProfileInput) {
    setSucesso(false)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({ phone: dados.telefone }).eq('id', user.id)

    const { data: existing } = await supabase
      .from('patients')
      .select('id')
      .eq('profile_id', user.id)
      .maybeSingle()

    const payload = {
      birth_date: dados.nascimento || null,
      gender: dados.genero,
      main_complaint: dados.queixa,
    }

    if (existing) {
      await supabase.from('patients').update(payload).eq('profile_id', user.id)
    } else {
      await supabase.from('patients').insert({ profile_id: user.id, ...payload })
    }

    setSucesso(true)
    setTimeout(() => setSucesso(false), 3000)
  }

  async function handleFotoEnviada(url: string) {
    setProfile((p) => (p ? { ...p, avatar_url: url } : p))
    await supabase.from('profiles').update({ avatar_url: url }).eq('id', userId)
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

      <div className="max-w-2xl mx-auto px-8 py-10">
        <h2 className="text-3xl font-serif text-slate-800 mb-2">Meu perfil</h2>
        <p className="text-slate-500 text-sm mb-8">Complete seus dados para uma melhor experiência</p>

        {sucesso && (
          <div className="bg-teal-50 text-teal-700 px-4 py-3 rounded-xl mb-6 text-sm">
            Perfil salvo com sucesso!
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
          {userId && <AvatarUpload userId={userId} url={profile?.avatar_url ?? null} onUploaded={handleFotoEnviada} />}

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Nome completo</label>
            <input
              type="text"
              value={capitalizarNome(profile?.full_name)}
              disabled
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">E-mail</label>
            <input
              type="email"
              value={profile?.email || ''}
              disabled
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 text-slate-400"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Telefone</label>
            <input
              type="text"
              placeholder="(11) 99999-9999"
              {...register('telefone')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Data de nascimento</label>
            <input
              type="date"
              {...register('nascimento')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Gênero</label>
            <select
              {...register('genero')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            >
              <option value="">Selecione</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="nao-binario">Não-binário</option>
              <option value="prefiro-nao-dizer">Prefiro não dizer</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Queixa principal</label>
            <textarea
              placeholder="Ex: Ansiedade, estresse no trabalho, relacionamentos..."
              rows={3}
              {...register('queixa')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 resize-none"
            />
            {errors.queixa && <p className="text-xs text-red-600 mt-1">{errors.queixa.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar perfil'}
          </button>
        </form>
      </div>
    </main>
  )
}
