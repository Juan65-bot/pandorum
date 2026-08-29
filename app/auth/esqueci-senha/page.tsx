'use client'
import { useState } from 'react'
import AuthShell from '@/components/AuthShell'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validation'

export default function EsqueciSenhaPage() {
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  async function onSubmit(dados: ForgotPasswordInput) {
    setErro('')
    const origin = window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(dados.email, {
      // Aponta direto para a tela de nova senha, sem passar pelo /auth/callback.
      // Esse fluxo pode devolver o token no fragmento da URL (#access_token=...),
      // que o navegador nunca envia ao servidor — uma rota de servidor no meio do
      // caminho enxerga a query vazia e manda o usuário para o login, que era
      // exatamente o "erro" relatado. O cliente do browser resolve as duas formas.
      redirectTo: `${origin}/auth/redefinir-senha`,
    })

    if (error) {
      setErro(error.message)
      return
    }

    setEnviado(true)
  }

  return (
    <AuthShell subtitulo="Recuperar senha">

        {enviado ? (
          <div className="bg-teal-50 text-teal-700 text-sm px-3 py-3 rounded-lg">
            Se esse e-mail existir na nossa base, enviamos um link para redefinir sua senha.
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <p className="text-sm text-slate-500">
              Informe o e-mail da sua conta para receber um link de redefinição de senha.
            </p>

            {erro && (
              <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg">{erro}</div>
            )}

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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar link de redefinição'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-500 mt-6">
          <Link href="/auth/login" className="text-teal-700 font-medium">Voltar ao login</Link>
        </p>
    </AuthShell>
  )
}
