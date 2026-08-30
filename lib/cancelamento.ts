import {
  PRECO_SESSAO_PADRAO,
  VALOR_MULTA_CANCELAMENTO_TARDIO,
  REPASSE_PSICOLOGO_CANCELAMENTO,
  RETENCAO_PLATAFORMA_CANCELAMENTO,
} from '@/lib/types'

/**
 * Regras de cancelamento da plataforma.
 *
 * Tudo aqui é função pura e sem I/O de propósito: o cálculo do que se cobra
 * roda SEMPRE no servidor (app/api/sessoes/cancelar), nunca no browser. O
 * front-end usa estas mesmas funções apenas para *mostrar* ao usuário o que
 * vai acontecer antes de ele confirmar — o valor que vale é o que o servidor
 * recalcula na hora de gravar. Se as duas contas divergirem, quem manda é o
 * servidor.
 */

/** Antecedência mínima para cancelar sem cobrança. */
export const HORAS_LIMITE_CANCELAMENTO = 24

/**
 * Janela de arrependimento depois de agendar, em minutos.
 *
 * Sem isto, quem agenda uma sessão para daqui a 2 horas já nasce dentro da
 * janela de multa: desmarcar cinco minutos depois de marcar custaria R$ 75,00.
 * Ninguém pode ser penalizado por perder um prazo que já havia passado no
 * instante em que ele contratou — além de ser indefensável perante o CDC.
 *
 * A janela é curta de propósito. Ela protege o arrependimento imediato e o
 * agendamento por engano, sem virar um jeito de segurar horário de graça.
 */
export const MINUTOS_ARREPENDIMENTO = 60

/** Fração do valor da sessão cobrada em cancelamento tardio do paciente. */
export const PERCENTUAL_MULTA_CANCELAMENTO_TARDIO =
  VALOR_MULTA_CANCELAMENTO_TARDIO / PRECO_SESSAO_PADRAO

export { VALOR_MULTA_CANCELAMENTO_TARDIO }

export type CanceladoPor = 'patient' | 'psychologist' | 'admin'

export interface ResultadoCancelamento {
  /** true quando a multa se aplica de fato (paciente cancelando com menos de 24h). */
  tardio: boolean
  /** Quanto o paciente paga. 0 em cancelamento gratuito. */
  valorMulta: number
  /** Parte da multa que vai para o psicólogo: R$ 50,00 fixos. */
  repassePsicologo: number
  /** Parte da multa que fica com a plataforma, antes da taxa do gateway: R$ 25,00. */
  comissaoPlataforma: number
  /** Horas de antecedência em relação ao início da sessão (negativo se já começou). */
  horasDeAntecedencia: number
  /** Texto pronto para exibir ao usuário, já no caso concreto. */
  explicacao: string
}

export function horasAteSessao(startsAt: string | Date, agora: Date = new Date()) {
  const inicio = typeof startsAt === 'string' ? new Date(startsAt) : startsAt
  return (inicio.getTime() - agora.getTime()) / (1000 * 60 * 60)
}

/**
 * Calcula a consequência financeira de um cancelamento.
 *
 * Três regras, nesta ordem de precedência:
 *   1. Psicólogo (ou admin) cancelando nunca gera cobrança para o paciente,
 *      independente da antecedência — quem desmarcou foi o profissional.
 *   2. Paciente cancelando com 24h ou mais de antecedência: gratuito.
 *   3. Paciente cancelando com menos de 24h: paga R$ 75,00 (metade da sessão),
 *      dos quais R$ 50,00 vão para o psicólogo — a mesma proporção de uma sessão
 *      realizada, porque o profissional reservou aquele horário e não pôde
 *      revendê-lo. Valores fixos, não percentuais: ver a nota em lib/types.ts
 *      sobre o split do Asaas incidir sobre o valor já líquido de taxas.
 *
 * Vale notar a interação com o vencimento da cobrança: a cobrança da sessão só
 * vence 24h antes dela, exatamente quando esta janela se fecha. Quem cancela a
 * tempo nunca chegou a pagar, então não existe estorno a fazer — a devolução
 * mencionada nos textos abaixo só se aplica a quem antecipou o pagamento.
 */
export function calcularCancelamento({
  startsAt,
  canceladoPor,
  criadoEm,
  agora = new Date(),
}: {
  startsAt: string | Date
  canceladoPor: CanceladoPor
  /** Quando a sessão foi agendada. Habilita a janela de arrependimento. */
  criadoEm?: string | Date | null
  agora?: Date
}): ResultadoCancelamento {
  const horas = horasAteSessao(startsAt, agora)
  const horasArredondadas = Math.round(horas * 10) / 10

  const minutosDesdeAgendamento = criadoEm
    ? (agora.getTime() - new Date(criadoEm).getTime()) / (1000 * 60)
    : Number.POSITIVE_INFINITY
  const dentroDoArrependimento = minutosDesdeAgendamento <= MINUTOS_ARREPENDIMENTO

  const gratuito =
    canceladoPor === 'psychologist' ||
    canceladoPor === 'admin' ||
    horas >= HORAS_LIMITE_CANCELAMENTO ||
    dentroDoArrependimento

  if (gratuito) {
    const explicacao =
      canceladoPor !== 'patient'
        ? 'Cancelamento feito pelo profissional. O paciente não é cobrado e qualquer valor já pago é devolvido integralmente.'
        : dentroDoArrependimento && horas < HORAS_LIMITE_CANCELAMENTO
          ? `Cancelamento gratuito: você agendou há menos de ${MINUTOS_ARREPENDIMENTO} minutos. Nada será cobrado.`
          : `Cancelamento gratuito: faltam mais de ${HORAS_LIMITE_CANCELAMENTO}h para a sessão. Nada será cobrado e qualquer valor já pago é devolvido integralmente.`

    return {
      tardio: false,
      valorMulta: 0,
      repassePsicologo: 0,
      comissaoPlataforma: 0,
      horasDeAntecedencia: horasArredondadas,
      explicacao,
    }
  }

  return {
    tardio: true,
    valorMulta: VALOR_MULTA_CANCELAMENTO_TARDIO,
    repassePsicologo: REPASSE_PSICOLOGO_CANCELAMENTO,
    comissaoPlataforma: RETENCAO_PLATAFORMA_CANCELAMENTO,
    horasDeAntecedencia: horasArredondadas,
    explicacao:
      `Cancelamento com menos de ${HORAS_LIMITE_CANCELAMENTO}h de antecedência: ` +
      `é cobrada uma taxa de ${(PERCENTUAL_MULTA_CANCELAMENTO_TARDIO * 100).toFixed(0)}% do valor da sessão. ` +
      `O restante, se já tiver sido pago, é devolvido.`,
  }
}

/** Se ainda dá para cancelar sem pagar nada. Usado só para destacar o prazo na tela. */
export function cancelamentoAindaGratuito(startsAt: string | Date, agora: Date = new Date()) {
  return horasAteSessao(startsAt, agora) >= HORAS_LIMITE_CANCELAMENTO
}

/** Momento a partir do qual o cancelamento passa a ser cobrado. */
export function prazoLimiteCancelamento(startsAt: string | Date) {
  const inicio = typeof startsAt === 'string' ? new Date(startsAt) : startsAt
  return new Date(inicio.getTime() - HORAS_LIMITE_CANCELAMENTO * 60 * 60 * 1000)
}
