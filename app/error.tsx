'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCw, ArrowLeft } from 'lucide-react'

/**
 * Error boundary de rota.
 *
 * A prop de recuperação é `unstable_retry` nesta versão do Next (adicionada na
 * 16.2.0) — ela refaz o fetch e re-renderiza os filhos. O `reset()` antigo
 * continua existindo, mas só limpa o estado do boundary sem buscar os dados de
 * novo, o que aqui não resolveria nada: os erros que chegam nesta tela vêm de
 * falha ao carregar dados do Supabase.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error('Erro não tratado na aplicação:', error)
  }, [error])

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-5 py-12">
      <div className="max-w-md w-full text-center">
        <div
          className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-6"
          aria-hidden="true"
        >
          <AlertTriangle className="w-7 h-7" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-serif text-slate-800 mb-3">Algo deu errado</h1>
        <p className="text-slate-500 text-sm leading-relaxed mb-8">
          Não conseguimos carregar esta página. Costuma ser passageiro — tentar de novo resolve na maioria das vezes.
          Se continuar acontecendo, nos avise.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 justify-center mb-6">
          <button
            onClick={() => unstable_retry()}
            className="flex items-center justify-center gap-2 bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            <RotateCw className="w-4 h-4" aria-hidden="true" />
            Tentar de novo
          </button>
          <Link
            href="/"
            className="flex items-center justify-center gap-2 border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            Voltar ao início
          </Link>
        </div>

        {error.digest && (
          <p className="text-xs text-slate-400">
            Código do erro: <code className="font-mono">{error.digest}</code>
          </p>
        )}
      </div>
    </main>
  )
}
