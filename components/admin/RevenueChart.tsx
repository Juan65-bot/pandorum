'use client'
import { formatarPreco } from '@/lib/utils'

export interface PontoReceita {
  label: string
  receita: number
  comissao: number
}

export default function RevenueChart({ dados }: { dados: PontoReceita[] }) {
  const maximo = Math.max(1, ...dados.map((d) => d.receita))

  return (
    <div>
      <div className="flex items-end gap-3 h-48">
        {dados.map((d) => {
          const alturaReceita = Math.max(2, (d.receita / maximo) * 100)
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5 group">
              <div className="relative w-full flex-1 flex items-end justify-center">
                <div
                  className="w-full max-w-10 rounded-t-md bg-teal-100 relative overflow-hidden transition-all"
                  style={{ height: `${alturaReceita}%` }}
                  title={`${d.label}: ${formatarPreco(d.receita)} de receita, ${formatarPreco(d.comissao)} de comissão`}
                >
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-purple-400 rounded-t-md"
                    style={{ height: `${(d.comissao / d.receita || 0) * 100}%` }}
                  />
                  <div className="absolute inset-0 bg-teal-600 opacity-0 group-hover:opacity-10 transition-opacity" />
                </div>
              </div>
              <span className="text-[10px] text-slate-400 whitespace-nowrap">{d.label}</span>
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 mt-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-teal-100" /> Receita bruta</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-purple-400" /> Comissão da plataforma</span>
      </div>
    </div>
  )
}
