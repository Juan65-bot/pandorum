import Link from 'next/link'
import { Compass, ArrowLeft, Search } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-5 py-12">
      <div className="max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mx-auto mb-6"
          aria-hidden="true"
        >
          <Compass className="w-7 h-7" />
        </div>

        <p className="text-xs font-medium text-slate-400 tracking-widest uppercase mb-2">Erro 404</p>
        <h1 className="text-2xl sm:text-3xl font-serif text-slate-800 mb-3">Essa página não existe</h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          O endereço pode ter mudado, ou o link que você seguiu está desatualizado. Nada de errado do seu lado.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Link
            href="/"
            className="flex items-center justify-center gap-2 bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar ao início
          </Link>
          <Link
            href="/psicologos"
            className="flex items-center justify-center gap-2 border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            Buscar psicólogos
          </Link>
        </div>
      </div>
    </main>
  )
}
