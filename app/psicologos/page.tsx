'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Search, BadgeCheck } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { formatarPreco } from '@/lib/utils'
import type { Psychologist } from '@/lib/types'

export default function PsicologosPage() {
  const [psicologos, setPsicologos] = useState<Psychologist[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function getPsicologos() {
      const { data } = await supabase
        .from('psychologists')
        .select('*, profiles(*)')
        .eq('status', 'approved')
        .order('rating_avg', { ascending: false })

      setPsicologos((data as unknown as Psychologist[]) || [])
      setLoading(false)
    }
    getPsicologos()
  }, [])

  const filtrados = psicologos.filter((p) => {
    const termo = busca.toLowerCase()
    return (
      p.profiles?.full_name?.toLowerCase().includes(termo) ||
      p.crp_number?.toLowerCase().includes(termo) ||
      p.specialties?.some((s) => s.toLowerCase().includes(termo))
    )
  })

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

        <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center gap-3 mb-8">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou especialidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="flex-1 text-sm outline-none text-slate-700"
          />
        </div>

        {loading ? (
          <p className="text-center text-slate-400 text-sm">Carregando...</p>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-400 text-sm">Nenhum psicólogo encontrado ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {filtrados.map((p) => (
              <Link
                key={p.id}
                href={`/psicologos/${p.id}`}
                className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:border-teal-200 transition-colors"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-lg overflow-hidden">
                    {p.profiles?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.profiles.avatar_url} alt={p.profiles?.full_name || ''} className="w-full h-full object-cover" />
                    ) : (
                      p.profiles?.full_name?.[0] || 'P'
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-slate-800 flex items-center gap-1.5">
                      {p.profiles?.full_name || 'Psicólogo'}
                      <BadgeCheck className="w-4 h-4 text-teal-600" />
                    </div>
                    <div className="text-xs text-slate-400">CRP {p.crp_number}</div>
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
                    {p.session_price ? formatarPreco(p.session_price) : '—'}/sessão
                  </span>
                  <span className="px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800">
                    Ver perfil
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
