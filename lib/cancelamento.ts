import { PRECO_SESSAO_PADRAO, TAXA_PLATAFORMA } from '@/lib/types'

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

/** Fração do valor da sessão cobrada em cancelamento tardio do paciente. */
export const PERCENTUAL_MULTA_CANCELAMENTO_TARDIO = 0.5

/** Valor em reais da multa por cancelamento tardio (R$ 75,00 sobre os R$ 150,00). */
export const VALOR_MULTA_CANCELAMENTO_TARDIO = Math.round(
  PRECO_SESSAO_PADRAO * PERCENTUAL_MULTA_CANCELAMENTO_TARDIO * 100
) / 100

export type CanceladoPor = 'patient' | 'psychologist' | 'admin'

export interface ResultadoCancelamento {
  /** true quando a multa se aplica de fato (paciente cancelando com menos de 24h). */
  tardio: boolean
  /** Quanto o paciente paga. 0 em cancelamento gratuito. */
  valorMulta: number
  /** Parte da multa que vai para o psicólogo (70%). */
  repassePsicologo: number
  /** Parte da multa que fica com a plataforma (30%). */
  comissaoPlataforma: number
  /** Horas de antecedência em relação ao início da sessão (negativo se já começou). */
  horasDeAntecedencia: number
  /** Texto pronto para exibir ao usuário, já no caso concreto. */
  explicacao: string
}

function arredondar(valor: number) {
  return Math.round(valor * 100) / 100
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
 *   3. Paciente cancelando com menos de 24h: paga 50% do valor da sessão,
 *      dividido 70% psicólogo / 30% plataforma (mesma divisão de uma sessão
 *      realizada — o profissional reservou aquele horário e não pôde revendê-lo).
 */
export function calcularCancelamento({
  startsAt,
  canceladoPor,
  agora = new Date(),
}: {
  startsAt: string | Date
  canceladoPor: CanceladoPor
  agora?: Date
}): ResultadoCancelamento {
  const horas = horasAteSessao(startsAt, agora)
  const horasArredondadas = Math.round(horas * 10) / 10

  const gratuito =
    canceladoPor === 'psychologist' ||
    canceladoPor === 'admin' ||
    horas >= HORAS_LIMITE_CANCELAMENTO

  if (gratuito) {
    return {
      tardio: false,
      valorMulta: 0,
      repassePsicologo: 0,
      comissaoPlataforma: 0,
      horasDeAntecedencia: horasArredondadas,
      explicacao:
        canceladoPor === 'patient'
          ? `Cancelamento gratuito: faltam mais de ${HORAS_LIMITE_CANCELAMENTO}h para a sessão. Nada será cobrado e qualquer valor já pago é devolvido integralmente.`
          : 'Cancelamento feito pelo profissional. O paciente não é cobrado e qualquer valor já pago é devolvido integralmente.',
    }
  }

  const valorMulta = VALOR_MULTA_CANCELAMENTO_TARDIO
  const comissaoPlataforma = arredondar(valorMulta * TAXA_PLATAFORMA)
  const repassePsicologo = arredondar(valorMulta - comissaoPlataforma)

  return {
    tardio: true,
    valorMulta,
    repassePsicologo,
    comissaoPlataforma,
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
