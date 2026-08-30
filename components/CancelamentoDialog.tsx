'use client'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CalendarCheck, Loader2, X } from 'lucide-react'
import PoliticaCancelamentoResumo from '@/components/PoliticaCancelamentoResumo'
import { calcularCancelamento, prazoLimiteCancelamento, type CanceladoPor } from '@/lib/cancelamento'
import { formatarDataHora, formatarPreco, cn } from '@/lib/utils'

interface CancelamentoDialogProps {
  appointmentId: string
  startsAt: string
  /** created_at da sessão, para a janela de arrependimento. */
  criadoEm?: string | null
  canceladoPor: CanceladoPor
  onFechar: () => void
  onCancelado: () => void
}

/**
 * Confirmação de cancelamento com a consequência financeira na tela ANTES do
 * clique final — substitui o window.confirm() que existia antes e não dizia
 * nada sobre cobrança.
 *
 * O valor mostrado aqui é uma previsão calculada no cliente com a mesma função
 * do servidor. Quem grava é /api/sessoes/cancelar, que refaz a conta com o
 * próprio relógio; a resposta dele é o que aparece no resultado final.
 */
export default function CancelamentoDialog({
  appointmentId,
  startsAt,
  criadoEm,
  canceladoPor,
  onFechar,
  onCancelado,
}: CancelamentoDialogProps) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultadoFinal, setResultadoFinal] = useState<{
    tardio: boolean
    valorMulta: number
    reembolso: number
    aviso: string | null
  } | null>(null)

  const dialogRef = useRef<HTMLDivElement>(null)
  const previsao = calcularCancelamento({ startsAt, canceladoPor, criadoEm })
  const prazoGratuito = prazoLimiteCancelamento(startsAt)

  // foco vai para o diálogo ao abrir e Esc fecha — sem isso o teclado fica
  // preso na página de trás e o leitor de tela não anuncia a mudança
  useEffect(() => {
    dialogRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !enviando) onFechar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enviando, onFechar])

  async function confirmar() {
    setEnviando(true)
    setErro('')

    const resposta = await fetch('/api/sessoes/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, motivo }),
    })

    const json = await resposta.json()
    setEnviando(false)

    if (!resposta.ok) {
      setErro(json.error || 'Não foi possível cancelar a sessão. Tente novamente.')
      return
    }

    setResultadoFinal({
      tardio: json.tardio,
      valorMulta: json.valorMulta,
      reembolso: json.reembolso,
      aviso: json.aviso ?? null,
    })
  }

  // ---------- depois de cancelado ----------
  if (resultadoFinal) {
    return (
      <Moldura onFechar={() => { onCancelado(); onFechar() }} titulo="Sessão cancelada" dialogRef={dialogRef}>
        <div className="flex items-start gap-3 bg-teal-50 text-teal-800 rounded-xl p-4 mb-4">
          <CalendarCheck className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm">
            <p className="font-medium mb-1">Cancelamento confirmado</p>
            <p>
              {resultadoFinal.tardio
                ? `Foi retida a taxa de ${formatarPreco(resultadoFinal.valorMulta)} por cancelamento com menos de 24h de antecedência.`
                : 'Nenhum valor foi cobrado.'}
            </p>
            {resultadoFinal.reembolso > 0 && (
              <p className="mt-1">
                Reembolso de {formatarPreco(resultadoFinal.reembolso)} em até 10 dias úteis, pelo mesmo meio de pagamento.
              </p>
            )}
          </div>
        </div>

        {resultadoFinal.aviso && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mb-4">{resultadoFinal.aviso}</p>
        )}

        <button
          onClick={() => { onCancelado(); onFechar() }}
          className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          Entendi
        </button>
      </Moldura>
    )
  }

  // ---------- confirmação ----------
  return (
    <Moldura onFechar={enviando ? undefined : onFechar} titulo="Cancelar sessão" dialogRef={dialogRef}>
      <p className="text-sm text-slate-600 mb-4">
        Sessão de <strong className="text-slate-800">{formatarDataHora(startsAt)}</strong>.
      </p>

      <div
        className={cn(
          'flex items-start gap-3 rounded-xl p-4 mb-4',
          previsao.tardio ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-800'
        )}
      >
        {previsao.tardio ? (
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
        ) : (
          <CalendarCheck className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
        )}
        <div className="text-sm">
          <p className="font-medium mb-1">
            {previsao.tardio
              ? `Será cobrada uma taxa de ${formatarPreco(previsao.valorMulta)}`
              : 'Cancelamento sem cobrança'}
          </p>
          <p className="leading-relaxed">{previsao.explicacao}</p>
          {canceladoPor === 'patient' && (
            <p className="mt-1.5 text-xs opacity-80">
              {previsao.tardio
                ? `O prazo gratuito era até ${formatarDataHora(prazoGratuito)}.`
                : `Você tem até ${formatarDataHora(prazoGratuito)} para cancelar sem custo.`}
            </p>
          )}
        </div>
      </div>

      <label htmlFor="motivo-cancelamento" className="text-sm font-medium text-slate-700 block mb-1">
        Motivo <span className="font-normal text-slate-400">(opcional)</span>
      </label>
      <textarea
        id="motivo-cancelamento"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        maxLength={300}
        placeholder="Ajuda a outra pessoa a entender o que aconteceu."
        className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-100 resize-none mb-4"
      />

      <PoliticaCancelamentoResumo className="mb-4" />

      {erro && (
        <p role="alert" className="text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2 mb-4">
          {erro}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onFechar}
          disabled={enviando}
          className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
        >
          Manter sessão
        </button>
        <button
          onClick={confirmar}
          disabled={enviando}
          className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
        >
          {enviando && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {enviando ? 'Cancelando...' : 'Confirmar cancelamento'}
        </button>
      </div>
    </Moldura>
  )
}

function Moldura({
  titulo, children, onFechar, dialogRef,
}: {
  titulo: string
  children: React.ReactNode
  onFechar?: () => void
  dialogRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onFechar}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-cancelamento"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto focus:outline-none"
      >
        <div className="flex items-start justify-between mb-4">
          <h2 id="titulo-cancelamento" className="text-lg font-serif text-slate-800">
            {titulo}
          </h2>
          {onFechar && (
            <button
              onClick={onFechar}
              aria-label="Fechar"
              className="text-slate-400 hover:text-slate-600 p-1 -m-1 rounded focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
