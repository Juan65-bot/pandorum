'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import AuthShell from '@/components/AuthShell'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validation'

type Estado = 'verificando' | 'pronto' | 'invalido'

export default function RedefinirSenhaPage() {
  const [estado, setEstado] = useState<Estado>('verificando')
  const [erro, setErro] = useState('')
  const router = useRouter()
  const [supabase] = useState(() => createClient())

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) })

  /**
   * O link do e-mail chega em duas formas conforme o fluxo que o gerou:
   *   • PKCE          -> "?code=..." na query
   *   • implícito     -> "#access_token=...&refresh_token=..." no fragmento
   *
   * O cliente do browser resolve o primeiro sozinho (detectSessionInUrl), mas
   * NÃO o segundo: com flowType 'pkce' — o padrão do createBrowserClient — ele
   * só olha para "?code=" e ignora o fragmento. Verificado em produção: a
   * página abria com os tokens na URL e ainda assim dizia "link inválido".
   * Por isso o fragmento é lido à mão aqui e entregue ao setSession.
   *
   * O fragmento também é limpo da barra de endereço depois de usado — ele
   * carrega um access_token válido por 1 hora, e não convém que fique no
   * histórico do navegador nem seja copiado junto ao compartilhar a URL.
   */
  useEffect(() => {
    let ativo = true

    const { data: sub } = supabase.auth.onAuthStateChange((evento, session) => {
      if (!ativo) return
      if (session || evento === 'PASSWORD_RECOVERY') setEstado('pronto')
    })

    async function estabelecerSessao() {
      const { data: atual } = await supabase.auth.getSession()
      if (!ativo) return
      if (atual.session) { setEstado('pronto'); return }

      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })
        if (!ativo) return
        if (!error) {
          window.history.replaceState(null, '', window.location.pathname)
          setEstado('pronto')
          return
        }
        console.error('Falha ao abrir sessão a partir do link de recuperação:', error.message)
      }

      // sobra o caso do "?code=", que o supabase-js troca sozinho mas leva um instante
      setTimeout(async () => {
        if (!ativo) return
        const { data } = await supabase.auth.getSession()
        if (!ativo) return
        setEstado(data.session ? 'pronto' : 'invalido')
      }, 1500)
    }

    estabelecerSessao()

    return () => {
      ativo = false
      sub.subscription.unsubscribe()
    }
  }, [supabase])

  async function onSubmit(dados: ResetPasswordInput) {
    setErro('')
    const { error } = await supabase.auth.updateUser({ password: dados.password })

    if (error) {
      setErro(
        error.message.toLowerCase().includes('session')
          ? 'Seu link de redefinição expirou. Peça um novo e tente de novo.'
          : error.message
      )
      return
    }

    router.push('/dashboard')
  }

  if (estado === 'verificando') {
    return (
      <AuthShell subtitulo="Defina sua nova senha">
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Validando seu link...
        </div>
      </AuthShell>
    )
  }

  if (estado === 'invalido') {
    return (
      <AuthShell subtitulo="Link inválido ou expirado">
        <div className="flex items-start gap-2 bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            Este link de redefinição não é mais válido. Eles valem por 1 hora e só podem ser usados uma vez.
          </span>
        </div>
        <Link
          href="/auth/esqueci-senha"
          className="block text-center bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 mt-5"
        >
          Pedir um novo link
        </Link>
        <p className="text-center text-sm text-slate-500 mt-4">
          <Link href="/auth/login" className="text-teal-700 font-medium">Voltar ao login</Link>
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitulo="Defina sua nova senha">
      {erro && (
        <div className="bg-red-50 text-red-700 text-sm px-3 py-2 rounded-lg mb-4">{erro}</div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="senha" className="text-sm font-medium text-slate-700 block mb-1">Nova senha</label>
          <input
            id="senha"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 8 caracteres"
            {...register('password')}
            className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500"
          />
          {errors.password && <p className="text-xs text-red-600 mt-1">{errors.password.message}</p>}
        </div>
        <div>
          <label htmlFor="confirmar" className="text-sm font-medium text-slate-700 block mb-1">Confirmar nova senha</label>
          <input
            id="confirmar"
            type="password"
            autoComplete="new-password"
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
    </AuthShell>
  )
}
