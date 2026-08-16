'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut, ArrowLeft } from 'lucide-react'
import { useSession } from '@/lib/hooks/useSession'
import { capitalizarNome } from '@/lib/utils'

interface HeaderProps {
  backHref?: string
  backLabel?: string
}

export default function Header({ backHref, backLabel = 'Voltar' }: HeaderProps) {
  const { user, profile, loading, supabase } = useSession()
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <header className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between">
      <Link href="/" className="text-xl font-serif text-slate-800">
        Pan<span className="text-teal-600">dorum</span>
      </Link>

      {backHref ? (
        <Link href={backHref} className="flex items-center gap-1.5 text-sm text-teal-700 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          {backLabel}
        </Link>
      ) : loading ? null : user ? (
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2.5 text-sm text-slate-600">
            <span className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-xs overflow-hidden flex-shrink-0">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                capitalizarNome(profile?.full_name)[0] || 'U'
              )}
            </span>
            Olá, {capitalizarNome(profile?.full_name).split(' ')[0] || 'Usuário'}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      ) : (
        <div className="flex gap-3">
          <Link href="/auth/login" className="px-5 py-2 text-sm font-medium text-teal-700 border border-teal-200 rounded-full hover:bg-teal-50">
            Entrar
          </Link>
          <Link href="/auth/register" className="px-5 py-2 text-sm font-medium text-white bg-teal-700 rounded-full hover:bg-teal-800">
            Cadastrar
          </Link>
        </div>
      )}
    </header>
  )
}
