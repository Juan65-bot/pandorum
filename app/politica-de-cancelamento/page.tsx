import type { Metadata } from 'next'
import Link from 'next/link'
import { CalendarCheck, CalendarX, UserCheck, Clock, Wallet, HelpCircle } from 'lucide-react'
import Header from '@/components/Header'
import { formatarPreco } from '@/lib/utils'
import {
  PRECO_SESSAO_PADRAO,
  DURACAO_SESSAO_MINUTOS,
  REPASSE_PSICOLOGO_CANCELAMENTO,
  RETENCAO_PLATAFORMA_CANCELAMENTO,
} from '@/lib/types'
import {
  HORAS_LIMITE_CANCELAMENTO,
  VALOR_MULTA_CANCELAMENTO_TARDIO,
  PERCENTUAL_MULTA_CANCELAMENTO_TARDIO,
  MINUTOS_ARREPENDIMENTO,
} from '@/lib/cancelamento'

export const metadata: Metadata = {
  title: 'Política de cancelamento — Pandorum',
  description:
    'Como funcionam cancelamentos e reembolsos no Pandorum: gratuito até 24h antes da sessão, taxa de 50% abaixo desse prazo, e nunca há cobrança quando o profissional cancela.',
}

const percentual = (PERCENTUAL_MULTA_CANCELAMENTO_TARDIO * 100).toFixed(0)
const repasse = REPASSE_PSICOLOGO_CANCELAMENTO
const comissao = RETENCAO_PLATAFORMA_CANCELAMENTO

export default function PoliticaCancelamentoPage() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/" />

      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-10 space-y-8">
        <header>
          <h1 className="text-2xl sm:text-3xl font-serif text-slate-800 mb-2">Política de cancelamento</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            Sessões de terapia dependem de um horário reservado só para você. Estas regras existem para equilibrar
            duas coisas: sua liberdade de desmarcar e o tempo que o profissional bloqueou na agenda e não conseguiu
            oferecer a mais ninguém.
          </p>
        </header>

        {/* três regras */}
        <section className="space-y-3">
          <Regra
            icone={<CalendarCheck className="w-5 h-5" />}
            cor="teal"
            titulo={`Até ${HORAS_LIMITE_CANCELAMENTO} horas antes — gratuito`}
          >
            <p>
              Você cancela sem pagar nada. Se a sessão já estiver paga, o valor é devolvido <strong>integralmente</strong>,
              pelo mesmo meio de pagamento, em até 10 dias úteis.
            </p>
          </Regra>

          <Regra
            icone={<CalendarX className="w-5 h-5" />}
            cor="amber"
            titulo={`Menos de ${HORAS_LIMITE_CANCELAMENTO} horas antes — taxa de ${percentual}%`}
          >
            <p>
              É cobrada uma taxa de <strong>{formatarPreco(VALOR_MULTA_CANCELAMENTO_TARDIO)}</strong>, equivalente a{' '}
              {percentual}% do valor da sessão ({formatarPreco(PRECO_SESSAO_PADRAO)}). O restante é devolvido.
            </p>
            <p className="mt-2">
              Com esse prazo o profissional já não consegue oferecer o horário a outro paciente. A taxa cobre
              parcialmente esse tempo reservado.
            </p>
          </Regra>

          <Regra
            icone={<UserCheck className="w-5 h-5" />}
            cor="teal"
            titulo="Cancelamento pelo profissional — sempre gratuito"
          >
            <p>
              Se o psicólogo precisar cancelar, <strong>você nunca é cobrado</strong>, independente da antecedência,
              e recebe o reembolso integral de qualquer valor já pago.
            </p>
          </Regra>

          <Regra
            icone={<Clock className="w-5 h-5" />}
            cor="teal"
            titulo={`Acabou de agendar? Você tem ${MINUTOS_ARREPENDIMENTO} minutos`}
          >
            <p>
              Cancelamentos feitos em até <strong>{MINUTOS_ARREPENDIMENTO} minutos após o agendamento</strong> são
              sempre gratuitos, mesmo que a sessão seja logo em seguida.
            </p>
            <p>
              É o que protege quem marca uma sessão para daqui a poucas horas: sem essa janela, o horário já nasceria
              dentro do prazo de cobrança e desmarcar cinco minutos depois de marcar custaria a taxa integral.
            </p>
          </Regra>
        </section>

        {/* para onde vai o dinheiro */}
        <section className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-medium text-slate-800 mb-3">
            <Wallet className="w-4 h-4 text-teal-600" aria-hidden="true" />
            Para onde vai a taxa de cancelamento
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-4">
            A taxa não é uma multa da plataforma: ela é dividida na mesma proporção de uma sessão realizada.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <caption className="sr-only">
                Divisão da taxa de cancelamento tardio entre profissional e plataforma
              </caption>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <th scope="row" className="text-left font-normal text-slate-600 py-2">
                    Taxa cobrada do paciente
                  </th>
                  <td className="text-right font-medium text-slate-800 py-2">
                    {formatarPreco(VALOR_MULTA_CANCELAMENTO_TARDIO)}
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="text-left font-normal text-slate-600 py-2">
                    Repassado ao psicólogo
                  </th>
                  <td className="text-right font-medium text-teal-700 py-2">{formatarPreco(repasse)}</td>
                </tr>
                <tr>
                  <th scope="row" className="text-left font-normal text-slate-600 py-2">
                    Retido pela plataforma
                  </th>
                  <td className="text-right font-medium text-slate-700 py-2">{formatarPreco(comissao)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* dúvidas */}
        <section className="bg-white rounded-2xl border border-slate-100 p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-medium text-slate-800 mb-4">
            <HelpCircle className="w-4 h-4 text-teal-600" aria-hidden="true" />
            Dúvidas frequentes
          </h2>
          <dl className="space-y-4">
            <Duvida pergunta="Como conto as 24 horas?">
              O prazo é contado a partir do horário de início da sessão. Uma sessão marcada para quinta às 15h pode
              ser cancelada gratuitamente até quarta às 15h. Na tela de cancelamento mostramos qual é o seu caso antes
              de você confirmar.
            </Duvida>
            <Duvida pergunta="Remarcar conta como cancelar?">
              Não. Remarcar mantém a sessão e apenas move o horário, sem nenhuma cobrança. Se você não conseguir
              comparecer, prefira remarcar em vez de cancelar.
            </Duvida>
            <Duvida pergunta="E se eu não aparecer na sessão?">
              Falta sem aviso tem o mesmo tratamento de um cancelamento com menos de {HORAS_LIMITE_CANCELAMENTO}h:
              a taxa de {percentual}% se aplica. A sala fica aberta por{' '}
              {DURACAO_SESSAO_MINUTOS} minutos a partir do horário marcado.
            </Duvida>
            <Duvida pergunta="Quando o reembolso cai na minha conta?">
              O pedido é enviado assim que o cancelamento é confirmado. O prazo depende do meio de pagamento:
              costuma ser de até 10 dias úteis no cartão e mais rápido no PIX.
            </Duvida>
            <Duvida pergunta="Posso contestar uma taxa?">
              Pode. Se houve uma emergência ou algum problema técnico da plataforma, fale com o suporte — cada caso é
              analisado individualmente.
            </Duvida>
          </dl>
        </section>

        <footer className="flex items-center gap-2 text-xs text-slate-400 pb-4">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          <span>
            Estas regras valem para sessões agendadas pelo Pandorum. Dúvidas sobre uma sessão específica podem ser
            vistas em{' '}
            <Link href="/sessoes" className="text-teal-700 hover:underline">
              Minhas sessões
            </Link>
            .
          </span>
        </footer>
      </div>
    </main>
  )
}

const CORES = {
  teal: 'bg-teal-50 border-teal-100 text-teal-700',
  amber: 'bg-amber-50 border-amber-100 text-amber-700',
} as const

function Regra({
  icone, cor, titulo, children,
}: {
  icone: React.ReactNode
  cor: keyof typeof CORES
  titulo: string
  children: React.ReactNode
}) {
  return (
    <article className={`rounded-2xl border p-5 ${CORES[cor]}`}>
      <h2 className="flex items-start gap-3 font-medium mb-2">
        <span className="flex-shrink-0 mt-0.5" aria-hidden="true">{icone}</span>
        <span>{titulo}</span>
      </h2>
      <div className="text-sm leading-relaxed opacity-90 pl-8">{children}</div>
    </article>
  )
}

function Duvida({ pergunta, children }: { pergunta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-700 mb-1">{pergunta}</dt>
      <dd className="text-sm text-slate-500 leading-relaxed">{children}</dd>
    </div>
  )
}
