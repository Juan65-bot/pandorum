'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, BadgeCheck, Star, SlidersHorizontal, X, AlertTriangle } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { formatarPreco, capitalizarNome, cn } from '@/lib/utils'
import { ESPECIALIDADES, PRECO_SESSAO_PADRAO, type Psychologist } from '@/lib/types'

export default function PsicologosPage() {
  const [psicologos, setPsicologos] = useState<Psychologist[]>([])
  const [loading, setLoading] = useState(true)
  const [erroCarregamento, setErroCarregamento] = useState(false)
  const [busca, setBusca] = useState('')
  const [especialidadeFiltro, setEspecialidadeFiltro] = useState<string | null>(null)
  const [mostrarFiltros, setMostrarFiltros] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    async function getPsicologos() {
      const { data, error, count } = await supabase
        .from('psychologists')
        .select('*, profiles!profile_id(*)', { count: 'exact' })
        .eq('status', 'approved')
        .order('rating_avg', { ascending: false })

      if (error) {
        // não deixa o erro passar em silêncio: sem isso, uma falha na query
        // (ex.: RLS mal configurado, embed ambíguo) parecia "nenhum psicólogo
        // encontrado" em vez de mostrar que a busca falhou de verdade.
        console.error('Falha ao carregar psicólogos aprovados:', error)
        setErroCarregamento(true)
        setLoading(false)
        return
      }

      const lista = (data as unknown as Psychologist[]) || []
      if (count !== null && count !== lista.length) {
        console.warn(`get psicologos: banco reporta ${count} aprovados mas a query retornou ${lista.length}`)
      }

      setPsicologos(lista)
      setLoading(false)
    }
    getPsicologos()
  }, [])

  const filtrados = useMemo(() => {
    const termo = busca.toLowerCase()
    return psicologos.filter((p) => {
      const bateBusca =
        !termo ||
        p.profiles?.full_name?.toLowerCase().includes(termo) ||
        p.crp_number?.toLowerCase().includes(termo) ||
        p.specialties?.some((s) => s.toLowerCase().includes(termo))

      const bateEspecialidade = !especialidadeFiltro || p.specialties?.includes(especialidadeFiltro)

      return bateBusca && bateEspecialidade
    })
  }, [psicologos, busca, especialidadeFiltro])

  const filtrosAtivos = especialidadeFiltro !== null

  function limparFiltros() {
    setEspecialidadeFiltro(null)
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/dashboard" />

      <div className="max-w-4xl mx-auto px-8 py-10">
        <h2 className="text-3xl font-serif text-slate-800 mb-2">
          Encontre seu psicólogo
        </h2>
        <p className="text-slate-500 text-sm mb-8">
          Todos os profissionais são verificados e registrados no CFP
        </p>

        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 mb-3">
          <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Buscar por nome ou especialidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 text-sm outline-none text-slate-700 min-w-0"
          />
          <button
            onClick={() => setMostrarFiltros((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full flex-shrink-0 border transition-colors',
              filtrosAtivos ? 'bg-teal-700 text-white border-teal-700' : 'border-slate-200 text-slate-500 hover:border-teal-300'
            )}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filtros
          </button>
        </div>

        {mostrarFiltros && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
            <p className="text-xs font-medium text-slate-600 mb-2">Especialidade</p>
            <div className="flex flex-wrap gap-2">
              {ESPECIALIDADES.map((esp) => (
                <button
                  key={esp}
                  onClick={() => setEspecialidadeFiltro((atual) => (atual === esp ? null : esp))}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                    especialidadeFiltro === esp
                      ? 'bg-teal-700 text-white border-teal-700'
                      : 'border-slate-200 text-slate-600 hover:border-teal-300'
                  )}
                >
                  {esp}
                </button>
              ))}
            </div>
          </div>
        )}

        {filtrosAtivos && (
          <button onClick={limparFiltros} className="flex items-center gap-1 text-xs text-teal-700 hover:underline mb-6">
            <X className="w-3.5 h-3.5" />
            Limpar filtros
          </button>
        )}
        {!filtrosAtivos && <div className="mb-8" />}

        {loading ? (
          <p className="text-center text-slate-400 text-sm">Carregando...</p>
        ) : erroCarregamento ? (
          <div className="flex flex-col items-center gap-2 text-center py-20">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <p className="text-slate-500 text-sm">Não foi possível carregar a lista de psicólogos agora. Tente recarregar a página.</p>
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm">Nenhum psicólogo encontrado com esses filtros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {filtrados.map((p) => {
              const nome = capitalizarNome(p.profiles?.full_name) || 'Psicólogo'
              return (
                <Link
                  key={p.id}
                  href={`/psicologos/${p.id}`}
                  className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:border-teal-200 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-serif text-lg overflow-hidden flex-shrink-0">
                      {p.profiles?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.profiles.avatar_url} alt={nome} className="w-full h-full object-cover" />
                      ) : (
                        nome[0]
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-slate-800 flex items-center gap-1.5 truncate">
                        {nome}
                        <BadgeCheck className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>CRP {p.crp_number}</span>
                        {p.rating_count > 0 && (
                          <span className="flex items-center gap-0.5 text-amber-500">
                            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            {p.rating_avg} <span className="text-slate-400">({p.rating_count})</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {p.specialties && p.specialties.length > 0 && (
                    <div className="flex gap-2 flex-wrap mb-4">
                      {p.specialties.slice(0, 4).map((s: string) => (
                        <span key={s} className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-full">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                  {p.bio && (
                    <p className="text-xs text-slate-500 mb-4 line-clamp-2">{p.bio}</p>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-800">
                      {formatarPreco(PRECO_SESSAO_PADRAO)}/sessão
                    </span>
                    <span className="px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800">
                      Ver perfil
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}
