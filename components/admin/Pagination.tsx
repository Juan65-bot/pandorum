'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({
  paginaAtual,
  totalPaginas,
  totalItens,
  onMudarPagina,
}: {
  paginaAtual: number
  totalPaginas: number
  totalItens: number
  onMudarPagina: (pagina: number) => void
}) {
  if (totalPaginas <= 1) return null

  return (
    <div className="flex items-center justify-between px-1 py-3 text-xs text-slate-500">
      <span>{totalItens} {totalItens === 1 ? 'resultado' : 'resultados'}</span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onMudarPagina(paginaAtual - 1)}
          disabled={paginaAtual === 1}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Anterior
        </button>
        <span>Página {paginaAtual} de {totalPaginas}</span>
        <button
          onClick={() => onMudarPagina(paginaAtual + 1)}
          disabled={paginaAtual === totalPaginas}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >
          Próxima
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
