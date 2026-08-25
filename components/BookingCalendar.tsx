'use client'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Clock, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { gerarSlotsDisponiveis, agruparSlotsPorDia } from '@/lib/scheduling'
import { DURACAO_SESSAO_MINUTOS, type AvailabilitySlot } from '@/lib/types'
import { cn, formatarPreco } from '@/lib/utils'
import PoliticaCancelamentoResumo from '@/components/PoliticaCancelamentoResumo'

interface BookingCalendarProps {
  psychologistId: string
  sessionPrice: number
}

export default function BookingCalendar({ psychologistId, sessionPrice }: BookingCalendarProps) {
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([])
  const [busySlots, setBusySlots] = useState<Date[]>([])
  const [loading, setLoading] = useState(true)
  const [logado, setLogado] = useState(false)
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null)
  const [horarioSelecionado, setHorarioSelecionado] = useState<Date | null>(null)
  const [agendando, setAgendando] = useState(false)
  const [erro, setErro] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      try {
        const [{ data: { user } }, { data: disp }, { data: ocupados, error: erroOcupados }] = await Promise.all([
          supabase.auth.getUser(),
          supabase.from('availability_slots').select('*').eq('psychologist_id', psychologistId),
          supabase.rpc('get_busy_slots', { p_psychologist_id: psychologistId }),
        ])

        if (erroOcupados) {
          // A verificação de horários ocupados é só para UX (filtrar o que mostrar);
          // a unique index em appointments é quem garante que não haverá double-booking de fato.
          console.error('Não foi possível verificar horários ocupados:', erroOcupados.message)
        }

        setLogado(!!user)
        setAvailability(disp || [])
        setBusySlots((ocupados || []).map((o: { starts_at: string }) => new Date(o.starts_at)))
      } catch (err) {
        console.error('Erro ao carregar disponibilidade:', err)
      } finally {
        setLoading(false)
      }
    }
    carregar()
  }, [psychologistId])

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

  async function confirmarAgendamento() {
    if (!horarioSelecionado) return

    if (!logado) {
      router.push(`/auth/login?next=/psicologos`)
      return
    }

    setAgendando(true)
    setErro('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setAgendando(false); return }

    const startsAt = horarioSelecionado
    const endsAt = new Date(startsAt.getTime() + DURACAO_SESSAO_MINUTOS * 60000)

    const { data: agendamento, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: user.id,
        psychologist_id: psychologistId,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      // Antes toda falha virava "horário já reservado", o que mandava a pessoa
      // tentar outro horário para sempre quando a causa era outra — por exemplo
      // psicólogo não aprovado (trigger appointments_require_approved_psychologist).
      console.error('Erro ao criar agendamento:', error)
      const conflito = error.code === '23505'
      const psicologoIndisponivel = error.code === '23514' || error.message?.includes('não está disponível')

      setErro(
        conflito
          ? 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro.'
          : psicologoIndisponivel
            ? 'Este profissional não está disponível para agendamento no momento.'
            : 'Não foi possível concluir o agendamento. Tente novamente em instantes.'
      )
      setAgendando(false)
      return
    }

    router.push(`/sessoes/${agendamento.id}/pagamento`)
  }

  if (loading) return <p className="text-sm text-slate-400">Carregando horários...</p>

  if (dias.length === 0) {
    return <p className="text-sm text-slate-400">Este psicólogo ainda não tem horários disponíveis.</p>
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {dias.map((dia) => {
          const data = new Date(dia + 'T00:00:00')
          const ativo = dia === diaAtivo
          return (
            <button
              key={dia}
              onClick={() => { setDiaSelecionado(dia); setHorarioSelecionado(null) }}
              className={cn(
                'flex-shrink-0 flex flex-col items-center px-4 py-2.5 rounded-xl border text-sm transition-colors',
                ativo ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-300'
              )}
            >
              <span className="text-xs opacity-80">
                {data.toLocaleDateString('pt-BR', { weekday: 'short' })}
              </span>
              <span className="font-medium">{data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
            </button>
          )
        })}
      </div>

      {diaAtivo && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
          {slotsPorDia.get(diaAtivo)!.map((slot) => {
            const ativo = horarioSelecionado?.getTime() === slot.getTime()
            return (
              <button
                key={slot.toISOString()}
                onClick={() => setHorarioSelecionado(slot)}
                className={cn(
                  'px-3 py-2 rounded-lg text-sm border transition-colors',
                  ativo ? 'bg-teal-700 border-teal-700 text-white' : 'border-slate-200 text-slate-600 hover:border-teal-300'
                )}
              >
                {slot.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </button>
            )
          })}
        </div>
      )}

      {erro && <p className="text-sm text-red-600 mb-3">{erro}</p>}

      {horarioSelecionado && <PoliticaCancelamentoResumo className="mb-3" />}

      {horarioSelecionado && (
        <div className="bg-teal-50 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-teal-800">
            <div className="flex items-center gap-1.5 font-medium">
              <Calendar className="w-4 h-4" />
              {horarioSelecionado.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Clock className="w-4 h-4" />
              {horarioSelecionado.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {formatarPreco(sessionPrice)}
            </div>
          </div>
          <button
            onClick={confirmarAgendamento}
            disabled={agendando}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-700 text-white text-sm rounded-full hover:bg-teal-800 disabled:opacity-50 w-full sm:w-auto focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
          >
            {agendando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
            {agendando ? 'Agendando...' : 'Confirmar e pagar'}
          </button>
        </div>
      )}
    </div>
  )
}
