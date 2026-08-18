'use client'
import { useEffect, useMemo, useState } from 'react'
import { Calendar, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { gerarSlotsDisponiveis, agruparSlotsPorDia } from '@/lib/scheduling'
import { DURACAO_SESSAO_MINUTOS, type AvailabilitySlot } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function RescheduleCalendar({
  appointmentId,
  psychologistId,
  startsAtAtual,
  onReagendado,
  onCancelar,
}: {
  appointmentId: string
  psychologistId: string
  startsAtAtual: string
  onReagendado: () => void
  onCancelar: () => void
}) {
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([])
  const [busySlots, setBusySlots] = useState<Date[]>([])
  const [loading, setLoading] = useState(true)
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const [horarioSelecionado, setHorarioSelecionado] = useState<Date | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      try {
        const [{ data: disp }, { data: ocupados, error: erroOcupados }] = await Promise.all([
          supabase.from('availability_slots').select('*').eq('psychologist_id', psychologistId),
          supabase.rpc('get_busy_slots', { p_psychologist_id: psychologistId }),
        ])

        if (erroOcupados) console.error('Não foi possível verificar horários ocupados:', erroOcupados.message)

        setAvailability(disp || [])
        // exclui o próprio horário atual do agendamento da lista de ocupados,
        // senão o slot que ele já ocupa aparece como indisponível pra ele mesmo
        const atualTs = new Date(startsAtAtual).getTime()
        setBusySlots(
          (ocupados || [])
            .map((o: { starts_at: string }) => new Date(o.starts_at))
            .filter((d: Date) => d.getTime() !== atualTs)
        )
      } catch (err) {
        console.error('Erro ao carregar disponibilidade para reagendamento:', err)
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [psychologistId, startsAtAtual])

  const slots = useMemo(() => {
    const ocupadosComoFalsosAgendamentos = busySlots.map((data) => ({
      starts_at: data.toISOString(),
      status: 'confirmed' as const,
    }))
    return gerarSlotsDisponiveis(availability, ocupadosComoFalsosAgendamentos)
  }, [availability, busySlots])

  const slotsPorDia = useMemo(() => agruparSlotsPorDia(slots), [slots])
  const dias = Array.from(slotsPorDia.keys())
  const diaAtivo = diaSelecionado && dias.includes(diaSelecionado) ? diaSelecionado : dias[0] ?? null

  async function confirmarReagendamento() {
    if (!horarioSelecionado) return
    setSalvando(true)
    setErro('')

    const novoInicio = horarioSelecionado
    const novoFim = new Date(novoInicio.getTime() + DURACAO_SESSAO_MINUTOS * 60000)

    const { error } = await supabase
      .from('appointments')
      .update({ starts_at: novoInicio.toISOString(), ends_at: novoFim.toISOString() })
      .eq('id', appointmentId)

    if (error) {
      console.error('Erro ao reagendar sessão:', error)
      setErro(
        error.code === '23505'
          ? 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro.'
          : 'Não foi possível reagendar essa sessão.'
      )
      setSalvando(false)
      return
    }

    onReagendado()
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      {loading ? (
        <p className="text-sm text-slate-400">Carregando horários...</p>
      ) : dias.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhum horário livre encontrado para reagendar.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
            {dias.map((dia) => {
              const data = new Date(dia + 'T00:00:00')
              const ativo = dia === diaAtivo
              return (
                <button
                  key={dia}
                  onClick={() => { setDiaSelecionado(dia); setHorarioSelecionado(null) }}
                  className={cn(
                    'flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border text-xs transition-colors',
                    ativo ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-300'
                  )}
                >
                  <span className="opacity-80">{data.toLocaleDateString('pt-BR', { weekday: 'short' })}</span>
                  <span className="font-medium">{data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
                </button>
              )
            })}
          </div>

          {diaAtivo && (
            <div className="grid grid-cols-4 gap-2 mb-3">
              {slotsPorDia.get(diaAtivo)!.map((slot) => {
                const ativo = horarioSelecionado?.getTime() === slot.getTime()
                return (
                  <button
                    key={slot.toISOString()}
                    onClick={() => setHorarioSelecionado(slot)}
                    className={cn(
                      'px-2.5 py-1.5 rounded-lg text-xs border transition-colors',
                      ativo ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-300'
                    )}
                  >
                    {slot.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </button>
                )
              })}
            </div>
          )}

          {erro && <p className="text-xs text-red-600 mb-2">{erro}</p>}

          {horarioSelecionado && (
            <div className="bg-teal-50 rounded-xl p-3 flex items-center justify-between mb-2">
              <div className="text-xs text-teal-800 space-y-0.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <Calendar className="w-3.5 h-3.5" />
                  {horarioSelecionado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {horarioSelecionado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              <button
                onClick={confirmarReagendamento}
                disabled={salvando}
                className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800 disabled:opacity-50"
              >
                {salvando && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {salvando ? 'Salvando...' : 'Confirmar novo horário'}
              </button>
            </div>
          )}
        </>
      )}
      <button onClick={onCancelar} className="text-xs text-slate-400 hover:text-slate-600 hover:underline">
        Cancelar reagendamento
      </button>
    </div>
  )
}
