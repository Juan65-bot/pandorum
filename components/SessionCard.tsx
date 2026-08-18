'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Calendar, Video, CreditCard, X, Star, NotebookPen, CalendarClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatarDataHora, formatarPreco, capitalizarNome, cn } from '@/lib/utils'
import { podeEntrarNaSala } from '@/lib/scheduling'
import RescheduleCalendar from '@/components/RescheduleCalendar'
import type { Appointment, Role } from '@/lib/types'

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Aguardando pagamento',
  confirmed: 'Confirmada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
}

const STATUS_COLOR: Record<string, string> = {
  scheduled: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-teal-50 text-teal-700',
  completed: 'bg-slate-100 text-slate-600',
  cancelled: 'bg-red-50 text-red-600',
}

export default function SessionCard({
  appointment,
  role,
  precoSessao,
  onChange,
}: {
  appointment: Appointment
  role: Role
  precoSessao?: number
  onChange: () => void
}) {
  const [cancelando, setCancelando] = useState(false)
  const [mostrarAvaliacao, setMostrarAvaliacao] = useState(false)
  const [mostrarNotas, setMostrarNotas] = useState(false)
  const [mostrarReagendar, setMostrarReagendar] = useState(false)
  const supabase = createClient()

  const outraParte = capitalizarNome(
    role === 'psychologist' ? appointment.patients_profile?.full_name : appointment.psychologists?.profiles?.full_name
  )

  const futura = new Date(appointment.starts_at) > new Date()
  const podeEntrar = appointment.status === 'confirmed' && podeEntrarNaSala(appointment.starts_at, appointment.ends_at)
  const podeCancelar = futura && ['scheduled', 'confirmed'].includes(appointment.status)

  async function cancelar() {
    if (!confirm('Tem certeza que deseja cancelar essa sessão?')) return
    setCancelando(true)
    await supabase
      .from('appointments')
      .update({ status: 'cancelled', cancelled_reason: `Cancelada por ${role === 'psychologist' ? 'psicólogo(a)' : 'paciente'}` })
      .eq('id', appointment.id)
    setCancelando(false)
    onChange()
  }

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-medium text-slate-800">{outraParte || 'Usuário'}</p>
          <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
            <Calendar className="w-3.5 h-3.5" />
            {formatarDataHora(appointment.starts_at)}
          </p>
        </div>
        <span className={cn('text-xs px-2.5 py-1 rounded-full font-medium', STATUS_COLOR[appointment.status])}>
          {STATUS_LABEL[appointment.status]}
        </span>
      </div>

      {precoSessao !== undefined && <p className="text-sm text-slate-500 mb-3">{formatarPreco(precoSessao)}</p>}

      <div className="flex items-center gap-2 flex-wrap">
        {appointment.status === 'scheduled' && role === 'patient' && (
          <Link
            href={`/sessoes/${appointment.id}/pagamento`}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800"
          >
            <CreditCard className="w-3.5 h-3.5" />
            Pagar agora
          </Link>
        )}
        {appointment.status === 'confirmed' && (
          <Link
            href={`/sessoes/${appointment.id}/sala`}
            aria-disabled={!podeEntrar}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 text-xs rounded-full',
              podeEntrar
                ? 'bg-teal-700 text-white hover:bg-teal-800'
                : 'bg-slate-100 text-slate-400 pointer-events-none'
            )}
          >
            <Video className="w-3.5 h-3.5" />
            {podeEntrar ? 'Entrar na sessão' : 'Sala libera 10min antes'}
          </Link>
        )}
        {appointment.status === 'completed' && role === 'patient' && (
          <button
            onClick={() => setMostrarAvaliacao((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-xs rounded-full hover:bg-slate-50"
          >
            <Star className="w-3.5 h-3.5" />
            Avaliar
          </button>
        )}
        {appointment.status === 'completed' && role === 'psychologist' && (
          <button
            onClick={() => setMostrarNotas((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-xs rounded-full hover:bg-slate-50"
          >
            <NotebookPen className="w-3.5 h-3.5" />
            Notas da sessão
          </button>
        )}
        {podeCancelar && (
          <button
            onClick={() => setMostrarReagendar((v) => !v)}
            className="flex items-center gap-1.5 px-4 py-2 border border-slate-200 text-slate-600 text-xs rounded-full hover:bg-slate-50"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Reagendar
          </button>
        )}
        {podeCancelar && (
          <button
            onClick={cancelar}
            disabled={cancelando}
            className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 text-xs rounded-full hover:bg-red-50 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            Cancelar
          </button>
        )}
      </div>

      {mostrarReagendar && (
        <RescheduleCalendar
          appointmentId={appointment.id}
          psychologistId={appointment.psychologist_id}
          startsAtAtual={appointment.starts_at}
          onReagendado={() => { setMostrarReagendar(false); onChange() }}
          onCancelar={() => setMostrarReagendar(false)}
        />
      )}

      {mostrarAvaliacao && (
        <ReviewForm
          appointmentId={appointment.id}
          patientId={appointment.patient_id}
          psychologistId={appointment.psychologist_id}
          onDone={() => { setMostrarAvaliacao(false); onChange() }}
        />
      )}

      {mostrarNotas && (
        <SessionNoteForm appointmentId={appointment.id} />
      )}
    </div>
  )
}

function SessionNoteForm({ appointmentId }: { appointmentId: string }) {
  const [conteudo, setConteudo] = useState('')
  const [humor, setHumor] = useState<number | ''>('')
  const [proximosPassos, setProximosPassos] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    async function carregar() {
      try {
        const resposta = await fetch(`/api/notas-sessao?appointmentId=${appointmentId}`)
        const dados = await resposta.json()
        if (dados.nota) {
          setConteudo(dados.nota.conteudo)
          setHumor(dados.nota.humor ?? '')
          setProximosPassos(dados.nota.proximosPassos)
        }
      } catch (err) {
        console.error('Erro ao carregar notas da sessão:', err)
      } finally {
        setCarregando(false)
      }
    }
    carregar()
  }, [appointmentId])

  async function salvar() {
    setSalvando(true)
    setErro('')
    const resposta = await fetch('/api/notas-sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, conteudo, humor, proximosPassos }),
    })

    if (!resposta.ok) {
      setErro('Não foi possível salvar as notas.')
      setSalvando(false)
      return
    }
    setSalvando(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  if (carregando) {
    return <p className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400">Carregando notas...</p>
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
      <p className="text-xs text-slate-400">Anotações clínicas privadas, criptografadas — visíveis só para você.</p>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      <textarea
        placeholder="Anotações da sessão..."
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={3}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
      />
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-slate-500 block mb-1">Humor do paciente (1-10)</label>
          <input
            type="number"
            min={1}
            max={10}
            value={humor}
            onChange={(e) => setHumor(e.target.value === '' ? '' : Number(e.target.value))}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
        </div>
      </div>
      <textarea
        placeholder="Próximos passos..."
        value={proximosPassos}
        onChange={(e) => setProximosPassos(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none"
      />
      <button
        onClick={salvar}
        disabled={salvando}
        className="px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800 disabled:opacity-50"
      >
        {salvando ? 'Salvando...' : salvo ? 'Salvo!' : 'Salvar notas'}
      </button>
    </div>
  )
}

function ReviewForm({
  appointmentId,
  patientId,
  psychologistId,
  onDone,
}: {
  appointmentId: string
  patientId: string
  psychologistId: string
  onDone: () => void
}) {
  const [nota, setNota] = useState(5)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const supabase = createClient()

  async function enviar() {
    setEnviando(true)
    await supabase.from('reviews').insert({
      appointment_id: appointmentId,
      patient_id: patientId,
      psychologist_id: psychologistId,
      rating: nota,
      comment: comentario || null,
    })
    setEnviando(false)
    onDone()
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <div className="flex gap-1 mb-3">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => setNota(n)}>
            <Star className={cn('w-5 h-5', n <= nota ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
          </button>
        ))}
      </div>
      <textarea
        placeholder="Como foi sua sessão? (opcional)"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm mb-3 resize-none"
      />
      <button
        onClick={enviar}
        disabled={enviando}
        className="px-4 py-2 bg-teal-700 text-white text-xs rounded-full hover:bg-teal-800 disabled:opacity-50"
      >
        {enviando ? 'Enviando...' : 'Enviar avaliação'}
      </button>
    </div>
  )
}
