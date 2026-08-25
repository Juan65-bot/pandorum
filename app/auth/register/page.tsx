'use client'
import { useState } from 'react'
import AuthShell from '@/components/AuthShell'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { registerSchema, type RegisterInput } from '@/lib/validation'

export default function RegisterPage() {
  const [erro, setErro] = useState('')
  const [tipo, setTipo] = useState<'patient' | 'psychologist'>('patient')
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { tipo: 'patient' },
  })

  function selecionarTipo(novoTipo: 'patient' | 'psychologist') {
    setTipo(novoTipo)
    setValue('tipo', novoTipo)
  }

  async function onSubmit(dados: RegisterInput) {
    setErro('')

    const proximaRota = dados.tipo === 'psychologist' ? '/psicologo/termos' : '/dashboard'

    const { data, error } = await supabase.auth.signUp({
      email: dados.email,
      password: dados.password,
      options: {
        data: { full_name: dados.nome, role: dados.tipo },
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${proximaRota}`,
      },
    })

    if (error) {
      setErro(error.message)
      return
    }

    if (!data.session) {
      router.push('/auth/login?confirmacao=1')
      return
    }

    if (data.user) {
      await ensureProfile(supabase, data.user)
    }

    router.push(proximaRota)
  }

  return (
    <AuthShell subtitulo="Crie sua conta">

        <div className="flex gap-3 mb-6">
          <button
            type="button"
            onClick={() => selecionarTipo('patient')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              tipo === 'patient'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            Sou Paciente
          </button>
          <button
            type="button"
            onClick={() => selecionarTipo('psychologist')}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${
              tipo === 'psychologist'
                ? 'bg-teal-700 text-white border-teal-700'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            Sou Psicólogo
          </button>
        </div>

        {erro && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Nome completo</label>
            <input
              type="text"
              placeholder="Seu nome"
              {...register('nome')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
            {errors.nome && <p className="text-xs text-red-600 mt-1">{errors.nome.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">E-mail</label>
            <input
              type="email"
              placeholder="seu@email.com"
              {...register('email')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
            {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Senha</label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              {...register('password')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Já tem conta?{' '}
          <Link href="/auth/login" className="text-teal-700 font-medium">Entrar</Link>
        </p>
    </AuthShell>
  )
}
