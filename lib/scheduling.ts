import type { Appointment, AvailabilitySlot } from '@/lib/types'
import { DURACAO_SESSAO_MINUTOS } from '@/lib/types'

function mesmaData(a: Date, b: Date) {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)
}

/**
 * Gera os horários livres a partir das regras de disponibilidade (recorrentes
 * por dia da semana ou específicas de uma data), removendo horários já
 * ocupados por agendamentos ativos e horários no passado.
 */
export function gerarSlotsDisponiveis(
  disponibilidade: AvailabilitySlot[],
  agendamentosExistentes: Pick<Appointment, 'starts_at' | 'status'>[],
  opcoes: { diasAFrente?: number; duracaoMinutos?: number; agora?: Date } = {}
): Date[] {
  const diasAFrente = opcoes.diasAFrente ?? 14
  const duracaoMinutos = opcoes.duracaoMinutos ?? DURACAO_SESSAO_MINUTOS
  const agora = opcoes.agora ?? new Date()

  const horariosOcupados = new Set(
    agendamentosExistentes
      .filter((a) => a.status === 'confirmed' || a.status === 'scheduled')
      .map((a) => new Date(a.starts_at).getTime())
  )

  const slots: Date[] = []

  for (let d = 0; d < diasAFrente; d++) {
    const dia = new Date(agora)
    dia.setDate(dia.getDate() + d)
    dia.setHours(0, 0, 0, 0)
    const weekday = dia.getDay()

    const regrasDoDia = disponibilidade.filter((r) => {
      if (r.day_of_week !== weekday) return false
      if (r.is_recurring) return true
      if (r.specific_date) return mesmaData(new Date(r.specific_date + 'T00:00:00'), dia)
      return false
    })

    for (const regra of regrasDoDia) {
      const [horaIni, minIni] = regra.start_time.split(':').map(Number)
      const [horaFim, minFim] = regra.end_time.split(':').map(Number)

      const inicio = new Date(dia)
      inicio.setHours(horaIni, minIni, 0, 0)

      const fim = new Date(dia)
      fim.setHours(horaFim, minFim, 0, 0)

      for (
        let slot = new Date(inicio);
        slot.getTime() + duracaoMinutos * 60000 <= fim.getTime();
        slot = new Date(slot.getTime() + duracaoMinutos * 60000)
      ) {
        if (slot.getTime() <= agora.getTime()) continue
        if (horariosOcupados.has(slot.getTime())) continue
        slots.push(new Date(slot))
      }
    }
  }

  return slots.sort((a, b) => a.getTime() - b.getTime())
}

export function agruparSlotsPorDia(slots: Date[]): Map<string, Date[]> {
  const grupos = new Map<string, Date[]>()
  for (const slot of slots) {
    const chave = slot.toISOString().slice(0, 10)
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave)!.push(slot)
  }
  return grupos
}

/** Sessão pode ser acessada de 10min antes até 60min depois do horário marcado. */
export function podeEntrarNaSala(startsAt: string, endsAt: string, agora = new Date()) {
  const inicio = new Date(startsAt)
  const fim = new Date(endsAt)
  const liberaEm = new Date(inicio.getTime() - 10 * 60000)
  const fechaEm = new Date(fim.getTime() + 60 * 60000)
  return agora >= liberaEm && agora <= fechaEm
}
