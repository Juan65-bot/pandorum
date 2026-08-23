'use client'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { ShieldOff, ShieldCheck, ChevronDown, ChevronUp, Search, ExternalLink } from 'lucide-react'
import Link from 'next/link'
import StatusBadge from '@/components/admin/StatusBadge'
import Pagination from '@/components/admin/Pagination'
import { createClient } from '@/lib/supabase/client'
import { capitalizarNome, formatarPreco, formatarCRP, cn } from '@/lib/utils'
import type { Psychologist, PsychologistStatus } from '@/lib/types'

const POR_PAGINA = 10
const FILTROS_STATUS: { label: string; valor: PsychologistStatus | 'todos' }[] = [
  { label: 'Todos', valor: 'todos' },
  { label: 'Verificados', valor: 'approved' },
  { label: 'Aguardando análise', valor: 'pending_review' },
  { label: 'Enviando documentos', valor: 'pending_documents' },
  { label: 'Suspensos', valor: 'suspended' },
  { label: 'Rejeitados', valor: 'rejected' },
]

interface LinhaPsicologo extends Psychologist {
  totalSessoes: number
  receitaGerada: number
}

export default function AdminPsicologosPage() {
  const [linhas, setLinhas] = useState<LinhaPsicologo[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<PsychologistStatus | 'todos'>('todos')
  const [pagina, setPagina] = useState(1)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [erroAcao, setErroAcao] = useState('')
  const supabase = createClient()

  async function carregar() {
    const [{ data: psicologos }, { data: appointments }, { data: payments }] = await Promise.all([
      supabase.from('psychologists').select('*, profiles!profile_id(*)'),
      supabase.from('appointments').select('psychologist_id, status'),
      supabase.from('payments').select('psychologist_id, platform_fee, status'),
    ])

    const sessoesPorPsi = new Map<string, number>()
    for (const a of appointments || []) {
      if (a.status === 'completed') sessoesPorPsi.set(a.psychologist_id, (sessoesPorPsi.get(a.psychologist_id) || 0) + 1)
    }

    const receitaPorPsi = new Map<string, number>()
    for (const p of payments || []) {
      if (p.status === 'paid') receitaPorPsi.set(p.psychologist_id, (receitaPorPsi.get(p.psychologist_id) || 0) + Number(p.platform_fee))
    }

    const combinado: LinhaPsicologo[] = ((psicologos as unknown as Psychologist[]) || []).map((p) => ({
      ...p,
      totalSessoes: sessoesPorPsi.get(p.id) || 0,
      receitaGerada: receitaPorPsi.get(p.id) || 0,
    }))

    setLinhas(combinado)
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase()
    return linhas.filter((p) => {
      const bateStatus = statusFiltro === 'todos' || p.status === statusFiltro
      const bateBusca =
        !termo ||
        p.profiles?.full_name?.toLowerCase().includes(termo) ||
        p.crp_number?.toLowerCase().includes(termo)
      return bateStatus && bateBusca
    })
  }, [linhas, busca, statusFiltro])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaEfetiva = Math.min(pagina, totalPaginas)
  const paginados = filtrados.slice((paginaEfetiva - 1) * POR_PAGINA, paginaEfetiva * POR_PAGINA)

  function handleBusca(valor: string) {
    setBusca(valor)
    setPagina(1)
  }

  function handleFiltroStatus(valor: PsychologistStatus | 'todos') {
    setStatusFiltro(valor)
    setPagina(1)
  }

  /**
   * Suspender/reativar passa pela mesma rota das verificações para que a ação
   * caia no log de auditoria imutável e dispare o e-mail — um update direto
   * daqui pularia as duas coisas.
   *
   * Aprovar NÃO acontece nesta tela de propósito: aprovação exige o checklist
   * e a conferência dos documentos, que vivem em /admin/verificacoes.
   */
  async function mudarStatus(id: string, acao: 'suspender' | 'reativar') {
    setErroAcao('')

    const resposta = await fetch('/api/admin/verificacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ psychologistId: id, acao }),
    })

    if (!resposta.ok) {
      const json = await resposta.json().catch(() => ({}))
      console.error('Erro ao mudar status do psicólogo:', json)
      setErroAcao(json.error || 'Não foi possível atualizar o status desse psicólogo.')
      return
    }

    carregar()
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
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-1">Psicólogos</h1>
        <p className="text-slate-500 text-sm">{linhas.length} cadastrados na plataforma</p>
      </div>

      {erroAcao && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{erroAcao}</div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 flex-1">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            value={busca}
            onChange={(e) => handleBusca(e.target.value)}
            placeholder="Buscar por nome ou CRP..."
            className="flex-1 text-sm outline-none min-w-0"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {FILTROS_STATUS.map((f) => (
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
                <th className="font-medium px-5 py-3">Psicólogo</th>
                <th className="font-medium px-5 py-3">Especialidade</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3 text-right">Sessões</th>
                <th className="font-medium px-5 py-3 text-right">Receita gerada</th>
                <th className="font-medium px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginados.map((p) => {
                const nome = capitalizarNome(p.profiles?.full_name) || 'Psicólogo'
                const aberto = expandido === p.id
                return (
                  <Fragment key={p.id}>
                    <tr className="hover:bg-slate-50/60">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium overflow-hidden flex-shrink-0">
                            {p.profiles?.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.profiles.avatar_url} alt={nome} className="w-full h-full object-cover" />
                            ) : (
                              nome[0]
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800 truncate">{nome}</p>
                            <p className="text-xs text-slate-400">{formatarCRP(p.crp_region, p.crp_number)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{p.specialties?.[0] || '—'}</td>
                      <td className="px-5 py-3"><StatusBadge tipo="psicologo" valor={p.status} /></td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700">{p.totalSessoes}</td>
                      <td className="px-5 py-3 text-right font-mono text-slate-700">{formatarPreco(p.receitaGerada)}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {p.status !== 'approved' && p.status !== 'suspended' && (
                            <Link
                              href="/admin/verificacoes"
                              title="Analisar documentos e aprovar"
                              className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </Link>
                          )}
                          {p.status === 'approved' && (
                            <button
                              onClick={() => mudarStatus(p.id, 'suspender')}
                              title="Suspender"
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50"
                            >
                              <ShieldOff className="w-4 h-4" />
                            </button>
                          )}
                          {p.status === 'suspended' && (
                            <button
                              onClick={() => mudarStatus(p.id, 'reativar')}
                              title="Reativar"
                              className="p-1.5 rounded-lg text-teal-600 hover:bg-teal-50"
                            >
                              <ShieldCheck className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setExpandido(aberto ? null : p.id)}
                            title="Ver perfil completo"
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                          >
                            {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {aberto && (
                      <tr key={`${p.id}-detalhe`} className="bg-slate-50/60">
                        <td colSpan={6} className="px-5 py-4 text-xs text-slate-600">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <p className="text-slate-400 mb-1">E-mail</p>
                              <p>{p.profiles?.email || '—'}</p>
                            </div>
                            <div>
                              <p className="text-slate-400 mb-1">Telefone</p>
                              <p>{p.profiles?.phone || '—'}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-slate-400 mb-1">Especialidades</p>
                              <div className="flex flex-wrap gap-1.5">
                                {p.specialties?.length ? p.specialties.map((s) => (
                                  <span key={s} className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full">{s}</span>
                                )) : '—'}
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-slate-400 mb-1">Abordagens</p>
                              <div className="flex flex-wrap gap-1.5">
                                {p.approaches?.length ? p.approaches.map((a) => (
                                  <span key={a} className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{a}</span>
                                )) : '—'}
                              </div>
                            </div>
                            <div className="sm:col-span-2">
                              <p className="text-slate-400 mb-1">Bio</p>
                              <p className="leading-relaxed">{p.bio || '—'}</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
              {paginados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-slate-400">Nenhum psicólogo encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5">
          <Pagination paginaAtual={paginaEfetiva} totalPaginas={totalPaginas} totalItens={filtrados.length} onMudarPagina={setPagina} />
        </div>
      </div>
    </div>
  )
}
