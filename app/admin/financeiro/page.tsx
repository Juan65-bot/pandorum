'use client'
import { useEffect, useState } from 'react'
import { Wallet, Percent, CheckCircle2, Clock3 } from 'lucide-react'
import RevenueChart, { type PontoReceita } from '@/components/admin/RevenueChart'
import { createClient } from '@/lib/supabase/client'
import { formatarPreco } from '@/lib/utils'
import { RETENCAO_PLATAFORMA_SESSAO, PRECO_SESSAO_PADRAO } from '@/lib/types'
import type { Payment } from '@/lib/types'

const MESES_HISTORICO = 6

export default function AdminFinanceiroPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase.from('payments').select('*')
      setPayments((data as unknown as Payment[]) || [])
      setLoading(false)
    }
    carregar()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    )
  }

  const pagos = payments.filter((p) => p.status === 'paid')
  const naoPagos = payments.filter((p) => p.status !== 'paid')

  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const receitaMesAtual = pagos
    .filter((p) => p.paid_at && new Date(p.paid_at) >= inicioMes)
    .reduce((s, p) => s + Number(p.amount_total), 0)

  const comissaoTotal = pagos.reduce((s, p) => s + Number(p.platform_fee), 0)

  const pontosGrafico: PontoReceita[] = []
  for (let i = MESES_HISTORICO - 1; i >= 0; i--) {
    const ref = new Date(agora.getFullYear(), agora.getMonth() - i, 1)
    const proxRef = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1)
    const doMes = pagos.filter((p) => p.paid_at && new Date(p.paid_at) >= ref && new Date(p.paid_at) < proxRef)
    pontosGrafico.push({
      label: ref.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
      receita: doMes.reduce((s, p) => s + Number(p.amount_total), 0),
      comissao: doMes.reduce((s, p) => s + Number(p.platform_fee), 0),
    })
  }

  const totalTransacoes = pagos.length + naoPagos.length
  const pctPagas = totalTransacoes ? Math.round((pagos.length / totalTransacoes) * 100) : 0

  return (
    <div className="px-6 md:px-10 py-8 md:py-10 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-1">Financeiro</h1>
        <p className="text-slate-500 text-sm">Receita, comissões e status de pagamento da plataforma</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-teal-700 rounded-2xl p-5 text-white shadow-sm">
          <div className="flex items-center gap-1.5 text-teal-100 text-xs mb-2"><Wallet className="w-4 h-4" /> Receita do mês atual</div>
          <div className="text-2xl font-serif">{formatarPreco(receitaMesAtual)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-1.5 text-purple-500 text-xs mb-2"><Percent className="w-4 h-4" /> Retido pela plataforma ({formatarPreco(RETENCAO_PLATAFORMA_SESSAO)} de {formatarPreco(PRECO_SESSAO_PADRAO)})</div>
          <div className="text-2xl font-serif text-slate-800">{formatarPreco(comissaoTotal)}</div>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-2"><CheckCircle2 className="w-4 h-4" /> Sessões pagas</div>
          <div className="text-2xl font-serif text-slate-800">{pctPagas}%</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mb-6">
        <h2 className="font-medium text-slate-800 text-sm mb-6">Receita por mês</h2>
        <RevenueChart dados={pontosGrafico} />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <h2 className="font-medium text-slate-800 text-sm mb-4">Sessões pagas vs não pagas</h2>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden flex">
            <div className="h-full bg-teal-600" style={{ width: `${pctPagas}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${100 - pctPagas}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-6 mt-4 text-xs text-slate-500">
          <span className="flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-teal-600" /> {pagos.length} pagas</span>
          <span className="flex items-center gap-1.5"><Clock3 className="w-3.5 h-3.5 text-amber-500" /> {naoPagos.length} não pagas</span>
        </div>
      </div>
    </div>
  )
}
