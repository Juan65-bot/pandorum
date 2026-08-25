import Link from 'next/link'
import { CalendarCheck, CalendarX, UserCheck } from 'lucide-react'
import { formatarPreco, cn } from '@/lib/utils'
import {
  HORAS_LIMITE_CANCELAMENTO,
  VALOR_MULTA_CANCELAMENTO_TARDIO,
  PERCENTUAL_MULTA_CANCELAMENTO_TARDIO,
} from '@/lib/cancelamento'

/**
 * Resumo da política de cancelamento, usado antes de confirmar um agendamento
 * e antes de confirmar um cancelamento. Os números saem das constantes de
 * lib/cancelamento — nada é digitado à mão aqui, para o texto nunca divergir
 * da regra que o servidor aplica.
 */
export default function PoliticaCancelamentoResumo({
  variante = 'completo',
  className,
}: {
  variante?: 'completo' | 'compacto'
  className?: string
}) {
  const percentual = (PERCENTUAL_MULTA_CANCELAMENTO_TARDIO * 100).toFixed(0)

  if (variante === 'compacto') {
    return (
      <p className={cn('text-xs text-slate-500 leading-relaxed', className)}>
        Cancelamento gratuito até {HORAS_LIMITE_CANCELAMENTO}h antes da sessão. Depois disso, é cobrada uma taxa de{' '}
        {percentual}% ({formatarPreco(VALOR_MULTA_CANCELAMENTO_TARDIO)}). Se o profissional cancelar, você nunca é cobrado.{' '}
        <Link href="/politica-de-cancelamento" className="text-teal-700 hover:underline">
          Ver política completa
        </Link>
      </p>
    )
  }

  const itens = [
    {
      icone: CalendarCheck,
      cor: 'text-teal-600',
      titulo: `Até ${HORAS_LIMITE_CANCELAMENTO}h antes: gratuito`,
      texto: 'Nenhuma cobrança. Se a sessão já estiver paga, o valor é devolvido integralmente.',
    },
    {
      icone: CalendarX,
      cor: 'text-amber-600',
      titulo: `Menos de ${HORAS_LIMITE_CANCELAMENTO}h antes: ${percentual}% (${formatarPreco(VALOR_MULTA_CANCELAMENTO_TARDIO)})`,
      texto: 'O profissional reservou o horário e não teve como remarcá-lo. O restante do valor é devolvido.',
    },
    {
      icone: UserCheck,
      cor: 'text-teal-600',
      titulo: 'Cancelamento pelo profissional: sempre gratuito',
      texto: 'Se o psicólogo cancelar, você não paga nada, independente da antecedência.',
    },
  ]

  return (
    <div className={cn('bg-slate-50 border border-slate-100 rounded-2xl p-4', className)}>
      <p className="text-xs font-medium text-slate-600 uppercase tracking-wide mb-3">
        Política de cancelamento
      </p>
      <ul className="space-y-2.5">
        {itens.map((item) => {
          const Icone = item.icone
          return (
            <li key={item.titulo} className="flex items-start gap-2.5">
              <Icone className={cn('w-4 h-4 flex-shrink-0 mt-0.5', item.cor)} aria-hidden="true" />
              <span>
                <span className="block text-sm text-slate-700 font-medium">{item.titulo}</span>
                <span className="block text-xs text-slate-500 leading-relaxed">{item.texto}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <Link
        href="/politica-de-cancelamento"
        className="inline-block mt-3 text-xs text-teal-700 hover:underline"
      >
        Ver política completa
      </Link>
    </div>
  )
}
