'use client'
import { Suspense, useState } from 'react'
import AuthShell from '@/components/AuthShell'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { loginSchema, type LoginInput } from '@/lib/validation'

function LoginForm() {
  const [erro, setErro] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const confirmacaoPendente = searchParams.get('confirmacao') === '1'
  const proximaRotaExplicita = searchParams.get('next')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(dados: LoginInput) {
    setErro('')

    const { data, error } = await supabase.auth.signInWithPassword(dados)

    if (error) {
      setErro('E-mail ou senha incorretos')
      return
    }

    if (proximaRotaExplicita) {
      router.push(proximaRotaExplicita)
      return
    }

    const profile = await ensureProfile(supabase, data.user)

    router.push(profile?.role === 'psychologist' ? '/psicologo/dashboard' : '/dashboard')
  }

  return (
    <AuthShell subtitulo="Bem-vindo de volta">

        {confirmacaoPendente && (
          <div className="bg-teal-50 text-teal-700 text-sm px-3 py-2 rounded-lg mb-4">
            Enviamos um e-mail de confirmação. Confirme sua conta antes de entrar.
          </div>
        )}

        {erro && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">
            {erro}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-slate-700">Senha</label>
              <Link href="/auth/esqueci-senha" className="text-xs text-teal-700 hover:underline">
                Esqueci minha senha
              </Link>
            </div>
            <input
              type="password"
              placeholder="Sua senha"
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
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-6">
          Não tem conta?{' '}
          <Link href="/auth/register" className="text-teal-700 font-medium">Cadastre-se</Link>
        </p>
    </AuthShell>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
