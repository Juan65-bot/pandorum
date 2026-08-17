'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, UserCog, Users, CalendarClock, Wallet, LogOut, ArrowLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const ITENS = [
  { href: '/admin', label: 'Visão geral', icone: LayoutDashboard },
  { href: '/admin/psicologos', label: 'Psicólogos', icone: UserCog },
  { href: '/admin/pacientes', label: 'Pacientes', icone: Users },
  { href: '/admin/sessoes', label: 'Sessões', icone: CalendarClock },
  { href: '/admin/financeiro', label: 'Financeiro', icone: Wallet },
] as const

function estaAtivo(pathname: string, href: string) {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)
}

export default function AdminSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function sair() {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <>
      {/* MOBILE: barra horizontal de abas */}
      <div className="md:hidden sticky top-0 z-10 bg-white border-b border-slate-100">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-serif text-slate-800">
            Pan<span className="text-teal-600">dorum</span> <span className="text-xs text-purple-500 font-sans align-top">admin</span>
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1 text-xs text-slate-400">
            <ArrowLeft className="w-3.5 h-3.5" /> Sair do admin
          </Link>
        </div>
        <nav className="flex gap-1 px-3 pb-3 overflow-x-auto">
          {ITENS.map((item) => {
            const Icone = item.icone
            const ativo = estaAtivo(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium flex-shrink-0 whitespace-nowrap',
                  ativo ? 'bg-teal-700 text-white' : 'bg-slate-50 text-slate-500'
                )}
              >
                <Icone className="w-3.5 h-3.5" />
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* DESKTOP: menu lateral fixo */}
      <aside className="hidden md:flex md:flex-col w-60 flex-shrink-0 min-h-screen bg-gradient-to-b from-teal-800 to-teal-900 text-white sticky top-0">
        <div className="px-6 py-6 border-b border-white/10">
          <Link href="/" className="text-xl font-serif">
            Pan<span className="text-teal-300">dorum</span>
          </Link>
          <p className="text-[11px] text-purple-300 tracking-wide uppercase mt-0.5">Painel administrativo</p>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1">
          {ITENS.map((item) => {
            const Icone = item.icone
            const ativo = estaAtivo(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors relative',
                  ativo ? 'bg-white/10 text-white' : 'text-teal-100/70 hover:bg-white/5 hover:text-white'
                )}
              >
                {ativo && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-purple-400" />}
                <Icone className="w-4 h-4" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-teal-100/70 hover:bg-white/5 hover:text-white">
            <ArrowLeft className="w-4 h-4" />
            Voltar à plataforma
          </Link>
          <button onClick={sair} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-300 hover:bg-white/5">
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </aside>
    </>
  )
}
