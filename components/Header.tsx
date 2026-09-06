'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, ArrowLeft, Home } from 'lucide-react'
import LogoInicio from '@/components/LogoInicio'
import { useSession } from '@/lib/hooks/useSession'
import { capitalizarNome } from '@/lib/utils'

interface HeaderProps {
  backHref?: string
  backLabel?: string
}

export default function Header({ backHref, backLabel = 'Voltar' }: HeaderProps) {
  const { user, profile, loading, supabase } = useSession()
  const router = useRouter()
  const pathname = usePathname()

  // No celular não existe hover, então nenhuma das pistas visuais do logo
  // aparece: ele volta a parecer só o nome do produto. Esta barra é a saída
  // explícita para a home em qualquer tela interna. Na própria home ela seria
  // um link para onde o usuário já está.
  const mostrarVoltarMobile = pathname !== '/'

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      <header className="bg-white border-b border-slate-100 px-5 sm:px-8 py-4 flex items-center justify-between gap-3">
        <LogoInicio />

        {backHref ? (
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm text-teal-700 hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            {backLabel}
          </Link>
        ) : loading ? null : user ? (
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <span className="flex items-center gap-2.5 text-sm text-slate-600 min-w-0">
              <span className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs overflow-hidden flex-shrink-0">
                {profile?.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  capitalizarNome(profile?.full_name)[0] || 'U'
                )}
              </span>
              <span className="truncate hidden sm:inline">
                Olá, {capitalizarNome(profile?.full_name).split(' ')[0] || 'Usuário'}
              </span>
            </span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sair
            </button>
          </div>
        ) : (
          <div className="flex gap-2 sm:gap-3">
            <Link href="/auth/login" className="px-4 sm:px-5 py-2 text-sm font-medium text-teal-700 border border-teal-200 rounded-full hover:bg-teal-50 whitespace-nowrap">
              Entrar
            </Link>
            <Link href="/auth/register" className="px-4 sm:px-5 py-2 text-sm font-medium text-white bg-teal-700 rounded-full hover:bg-teal-800 whitespace-nowrap">
              Cadastrar
            </Link>
          </div>
        )}
      </header>

      {mostrarVoltarMobile && (
        <Link
          href="/"
          className="
            sm:hidden flex items-center gap-2 px-5 py-2.5
            bg-slate-50 border-b border-slate-100
            text-sm text-slate-600 active:bg-slate-100
            focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2
            focus-visible:outline-teal-600
          "
        >
          <ArrowLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
          Voltar ao início
          <Home className="w-3.5 h-3.5 text-slate-300 ml-auto" aria-hidden="true" />
        </Link>
      )}
    </>
  )
}
