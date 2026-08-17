'use client'
import { useEffect, useMemo, useState } from 'react'
import { Search, UserCheck, UserX } from 'lucide-react'
import StatusBadge from '@/components/admin/StatusBadge'
import Pagination from '@/components/admin/Pagination'
import { createClient } from '@/lib/supabase/client'
import { capitalizarNome, formatarData, cn } from '@/lib/utils'
import type { Profile } from '@/lib/types'

const POR_PAGINA = 10

interface LinhaPaciente extends Profile {
  totalSessoes: number
}

export default function AdminPacientesPage() {
  const [linhas, setLinhas] = useState<LinhaPaciente[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [pagina, setPagina] = useState(1)
  const [erroAcao, setErroAcao] = useState('')
  const supabase = createClient()

  async function carregar() {
    const [{ data: pacientes }, { data: appointments }] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'patient'),
      supabase.from('appointments').select('patient_id, status'),
    ])

    const sessoesPorPaciente = new Map<string, number>()
    for (const a of appointments || []) {
      if (a.status === 'completed') sessoesPorPaciente.set(a.patient_id, (sessoesPorPaciente.get(a.patient_id) || 0) + 1)
    }

    const combinado: LinhaPaciente[] = ((pacientes as unknown as Profile[]) || []).map((p) => ({
      ...p,
      totalSessoes: sessoesPorPaciente.get(p.id) || 0,
    }))

    setLinhas(combinado.sort((a, b) => b.created_at.localeCompare(a.created_at)))
    setLoading(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregar()
  }, [])

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase()
    return linhas.filter(
      (p) => !termo || p.full_name?.toLowerCase().includes(termo) || p.email?.toLowerCase().includes(termo)
    )
  }, [linhas, busca])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaEfetiva = Math.min(pagina, totalPaginas)
  const paginados = filtrados.slice((paginaEfetiva - 1) * POR_PAGINA, paginaEfetiva * POR_PAGINA)

  function handleBusca(valor: string) {
    setBusca(valor)
    setPagina(1)
  }

  async function alternarAtivo(id: string, ativoAtual: boolean) {
    setErroAcao('')
    const { error } = await supabase.from('profiles').update({ is_active: !ativoAtual }).eq('id', id)
    if (error) {
      console.error('Erro ao atualizar status do paciente:', error)
      setErroAcao('Não foi possível atualizar o status dessa conta.')
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
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-1">Pacientes</h1>
        <p className="text-slate-500 text-sm">{linhas.length} cadastrados na plataforma</p>
      </div>

      {erroAcao && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">{erroAcao}</div>
      )}

      <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 mb-4 max-w-sm">
        <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
        <input
          value={busca}
          onChange={(e) => handleBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail..."
          className="flex-1 text-sm outline-none min-w-0"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-100">
                <th className="font-medium px-5 py-3">Paciente</th>
                <th className="font-medium px-5 py-3">Cadastrado em</th>
                <th className="font-medium px-5 py-3 text-right">Sessões concluídas</th>
                <th className="font-medium px-5 py-3">Status</th>
                <th className="font-medium px-5 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginados.map((p) => {
                const nome = capitalizarNome(p.full_name) || 'Paciente'
                return (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium overflow-hidden flex-shrink-0">
                          {p.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.avatar_url} alt={nome} className="w-full h-full object-cover" />
                          ) : (
                            nome[0]
                          )}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{nome}</p>
                          <p className="text-xs text-slate-400 truncate">{p.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatarData(p.created_at)}</td>
                    <td className="px-5 py-3 text-right font-mono text-slate-700">{p.totalSessoes}</td>
                    <td className="px-5 py-3"><StatusBadge tipo="conta" valor={String(p.is_active)} /></td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => alternarAtivo(p.id, p.is_active)}
                        title={p.is_active ? 'Desativar conta' : 'Ativar conta'}
                        className={cn(
                          'p-1.5 rounded-lg ml-auto flex',
                          p.is_active ? 'text-red-500 hover:bg-red-50' : 'text-teal-600 hover:bg-teal-50'
                        )}
                      >
                        {p.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {paginados.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">Nenhum paciente encontrado.</td>
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
