'use client'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import ptBrLocale from '@fullcalendar/core/locales/pt-br'
import type { Appointment } from '@/lib/types'

const CORES: Record<string, string> = {
  scheduled: '#f59e0b',
  confirmed: '#0f766e',
  completed: '#94a3b8',
  cancelled: '#ef4444',
}

export default function PsychologistCalendar({ appointments }: { appointments: Appointment[] }) {
  const eventos = appointments.map((a) => ({
    id: a.id,
    title: a.patients_profile?.full_name || 'Paciente',
    start: a.starts_at,
    end: a.ends_at,
    color: CORES[a.status] || '#0f766e',
  }))

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 [&_.fc]:text-sm">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
        locale={ptBrLocale}
        height="auto"
        allDaySlot={false}
        events={eventos}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
      />
    </div>
  )
}
