'use client'
import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import StatusBadge from '@/components/admin/StatusBadge'
import Pagination from '@/components/admin/Pagination'
import { createClient } from '@/lib/supabase/client'
import { capitalizarNome, formatarData, formatarHora, formatarPreco, cn } from '@/lib/utils'
import { PRECO_SESSAO_PADRAO, type Appointment, type AppointmentStatus, type Payment } from '@/lib/types'

const POR_PAGINA = 12
const FILTROS: { label: string; valor: AppointmentStatus | 'todos' }[] = [
  { label: 'Todas', valor: 'todos' },
  { label: 'Pendentes', valor: 'scheduled' },
  { label: 'Confirmadas', valor: 'confirmed' },
  { label: 'Concluídas', valor: 'completed' },
  { label: 'Canceladas', valor: 'cancelled' },
]

export default function AdminSessoesPage() {
  const [sessoes, setSessoes] = useState<Appointment[]>([])
  const [comissaoPorSessao, setComissaoPorSessao] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<AppointmentStatus | 'todos'>('todos')
  const [pagina, setPagina] = useState(1)
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const [{ data: appointments }, { data: payments }] = await Promise.all([
        supabase
          .from('appointments')
          .select('*, patients_profile:profiles!patient_id(*), psychologists(*, profiles!profile_id(*))')
          .order('starts_at', { ascending: false }),
        supabase.from('payments').select('appointment_id, platform_fee, status'),
      ])

      const mapaComissao = new Map<string, number>()
      for (const p of (payments as unknown as Payment[]) || []) {
        if (p.status === 'paid') mapaComissao.set(p.appointment_id, Number(p.platform_fee))
      }

      setSessoes((appointments as unknown as Appointment[]) || [])
      setComissaoPorSessao(mapaComissao)
      setLoading(false)
    }
    carregar()
  }, [])

  const filtradas = useMemo(() => {
    const termo = busca.toLowerCase()
    return sessoes.filter((a) => {
      const bateStatus = statusFiltro === 'todos' || a.status === statusFiltro
      const bateBusca =
        !termo ||
        a.patients_profile?.full_name?.toLowerCase().includes(termo) ||
        a.psychologists?.profiles?.full_name?.toLowerCase().includes(termo)
      return bateStatus && bateBusca
    })
  }, [sessoes, busca, statusFiltro])

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaEfetiva = Math.min(pagina, totalPaginas)
  const paginadas = filtradas.slice((paginaEfetiva - 1) * POR_PAGINA, paginaEfetiva * POR_PAGINA)

  function handleBusca(valor: string) {
    setBusca(valor)
    setPagina(1)
  }

  function handleFiltroStatus(valor: AppointmentStatus | 'todos') {
    setStatusFiltro(valor)
    setPagina(1)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="px-6 md:px-10 py-8 md:py-10 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-1">Sessões</h1>
        <p className="text-slate-500 text-sm">{sessoes.length} sessões registradas na plataforma</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            value={busca}
            onChange={(e) => handleBusca(e.target.value)}
            placeholder="Buscar por paciente ou psicólogo..."
            className="flex-1 text-sm outline-none min-w-0"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              onClick={() => handleFiltroStatus(f.valor)}
              className={cn(
                'px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0 border',
                statusFiltro === f.valor ? 'bg-teal-700 text-white border-teal-700' : 'bg-white border-slate-200 text-slate-500'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="font-medium px-5 py-3">Paciente</th>
                <th className="font-medium px-5 py-3">Psicólogo</th>
                <th className="font-medium px-5 py-3">Data e horário</th>
                <th className="font-medium px-5 py-3 text-right">Valor</th>
                <th className="font-medium px-5 py-3 text-right">Comissão</th>
                <th className="font-medium px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginadas.map((a) => {
                const comissao = comissaoPorSessao.get(a.id)
                return (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 text-slate-700">{capitalizarNome(a.patients_profile?.full_name) || '—'}</td>
                    <td className="px-5 py-3 text-slate-700">{capitalizarNome(a.psychologists?.profiles?.full_name) || '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{formatarData(a.starts_at)} · {formatarHora(a.starts_at)}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-700">{formatarPreco(PRECO_SESSAO_PADRAO)}</td>
                    <td className="px-5 py-3 text-right font-mono text-purple-600">{comissao !== undefined ? formatarPreco(comissao) : '—'}</td>
                    <td className="px-5 py-3"><StatusBadge tipo="sessao" valor={a.status} /></td>
                  </tr>
                )
              })}
              {paginadas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">Nenhuma sessão encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5">
          <Pagination paginaAtual={paginaEfetiva} totalPaginas={totalPaginas} totalItens={filtradas.length} onMudarPagina={setPagina} />
        </div>
      </div>
    </div>
  )
}
