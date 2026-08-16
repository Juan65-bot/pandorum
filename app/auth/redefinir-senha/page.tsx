'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validation'

export default function RedefinirSenhaPage() {
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  async function onSubmit(dados: ResetPasswordInput) {
    setErro('')
    const { error } = await supabase.auth.updateUser({ password: dados.password })

    if (error) {
      setErro(error.message)
      return
    }

    router.push('/dashboard')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-serif text-slate-800">
            Pan<span className="text-teal-600">dorum</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">Defina sua nova senha</p>
        </div>

        {erro && (
          <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{erro}</div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Nova senha</label>
            <input
              type="password"
              placeholder="Mínimo 8 caracteres"
              {...register('password')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
            {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700 block mb-1">Confirmar nova senha</label>
            <input
              type="password"
              placeholder="Repita a senha"
              {...register('confirmPassword')}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
            />
            {errors.confirmPassword && (
              <p className="text-xs text-red-600 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
          >
            {isSubmitting ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      </div>
    </main>
  )
}
