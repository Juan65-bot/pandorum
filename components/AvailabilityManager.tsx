'use client'
import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DIAS_SEMANA, type AvailabilitySlot } from '@/lib/types'

export default function AvailabilityManager({ psychologistId }: { psychologistId: string }) {
  const [regras, setRegras] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [dayOfWeek, setDayOfWeek] = useState('1')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('18:00')
  const [erro, setErro] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('availability_slots')
        .select('*')
        .eq('psychologist_id', psychologistId)
        .eq('is_recurring', true)
        .order('day_of_week')
        .order('start_time')
      setRegras(data || [])
      setLoading(false)
    }
    carregar()
  }, [psychologistId])

  async function adicionar() {
    setErro('')
    if (startTime >= endTime) {
      setErro('O horário final deve ser depois do inicial')
      return
    }

    setSalvando(true)
    const { data, error } = await supabase
      .from('availability_slots')
      .insert({
        psychologist_id: psychologistId,
        day_of_week: Number(dayOfWeek),
        start_time: startTime,
        end_time: endTime,
        is_recurring: true,
      })
      .select()
      .single()

    if (error) {
      setErro('Não foi possível salvar esse horário')
    } else if (data) {
      setRegras((prev) =>
        [...prev, data].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
      )
    }
    setSalvando(false)
  }

  async function remover(id: string) {
    setRegras((prev) => prev.filter((r) => r.id !== id))
    await supabase.from('availability_slots').delete().eq('id', id)
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
      <h3 className="font-medium text-slate-800 mb-1">Horários de atendimento</h3>
      <p className="text-sm text-slate-500 mb-4">
        Defina os horários recorrentes em que você atende. Os pacientes só verão os horários livres.
      </p>

      {loading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="space-y-2 mb-4">
          {regras.length === 0 && (
            <p className="text-sm text-slate-400">Nenhum horário cadastrado ainda.</p>
          )}
          {regras.map((r) => (
            <div key={r.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-2.5 text-sm">
              <span className="text-slate-700">
                {DIAS_SEMANA[r.day_of_week]} · {r.start_time.slice(0, 5)} às {r.end_time.slice(0, 5)}
              </span>
              <button onClick={() => remover(r.id)} className="text-slate-400 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Dia</label>
          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          >
            {DIAS_SEMANA.map((dia, i) => (
              <option key={dia} value={i}>{dia}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Início</label>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Fim</label>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={adicionar}
          disabled={salvando}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white text-sm rounded-lg hover:bg-teal-800 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Adicionar
        </button>
      </div>
    </div>
  )
}
