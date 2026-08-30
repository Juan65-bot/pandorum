import {
  PRECO_SESSAO_PADRAO,
  REPASSE_PSICOLOGO_SESSAO,
  HORAS_ANTES_VENCIMENTO_COBRANCA,
  type BillingType,
} from '@/lib/types'

/**
 * Cliente do Asaas por REST direto, sem SDK.
 *
 * Não existe SDK oficial: o escopo @asaas no npm não existe, e os pacotes de
 * terceiros disponíveis estão parados há anos (o mais recente é de mar/2025).
 * Adicionar uma dependência desatualizada para embrulhar meia dúzia de chamadas
 * HTTP traria mais risco que conveniência. Mesmo padrão já usado em lib/email.ts.
 *
 * Uso exclusivo de servidor: ASAAS_API_KEY não tem prefixo NEXT_PUBLIC_.
 */

export function asaasConfigurado() {
  return !!process.env.ASAAS_API_KEY
}

function baseUrl() {
  // sandbox por padrão: esquecer de definir a URL não pode significar cobrar de verdade
  return process.env.ASAAS_API_URL || 'https://api-sandbox.asaas.com/v3'
}

export function asaasEmProducao() {
  return baseUrl().includes('api.asaas.com')
}

interface ErroAsaasItem {
  code?: string
  description?: string
}

export class AsaasError extends Error {
  status: number
  erros: ErroAsaasItem[]

  constructor(status: number, erros: ErroAsaasItem[], contexto: string) {
    const detalhe = erros.map((e) => e.description || e.code).filter(Boolean).join('; ')
    super(`Asaas ${status} em ${contexto}${detalhe ? `: ${detalhe}` : ''}`)
    this.name = 'AsaasError'
    this.status = status
    this.erros = erros
  }
}

async function chamar<T>(
  caminho: string,
  opcoes: { method?: string; body?: unknown; chaveSubconta?: string } = {}
): Promise<T> {
  const chave = opcoes.chaveSubconta || process.env.ASAAS_API_KEY
  if (!chave) throw new Error('ASAAS_API_KEY não configurada')

  const resposta = await fetch(`${baseUrl()}${caminho}`, {
    method: opcoes.method || 'GET',
    headers: {
      access_token: chave,
      'Content-Type': 'application/json',
      // o Asaas pede identificação da aplicação integradora
      'User-Agent': 'Pandorum',
    },
    body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
  })

  const texto = await resposta.text()
  let json: unknown
  try {
    json = texto ? JSON.parse(texto) : {}
  } catch {
    throw new AsaasError(resposta.status, [{ description: texto.slice(0, 200) }], caminho)
  }

  if (!resposta.ok) {
    const erros = (json as { errors?: ErroAsaasItem[] }).errors || [{ description: texto.slice(0, 200) }]
    throw new AsaasError(resposta.status, erros, caminho)
  }

  return json as T
}

// ============================================================
// Clientes (pagadores)
// ============================================================

export interface AsaasCustomer {
  id: string
  name: string
  cpfCnpj: string
  email?: string
}

/**
 * Busca por CPF antes de criar. O Asaas aceita clientes duplicados com o mesmo
 * CPF sem reclamar, e sem essa checagem cada agendamento criaria um cliente
 * novo — o histórico do paciente ficaria espalhado por dezenas de cadastros.
 */
export async function obterOuCriarCliente(dados: {
  nome: string
  cpf: string
  email?: string
  telefone?: string
}): Promise<AsaasCustomer> {
  const cpfLimpo = dados.cpf.replace(/\D/g, '')

  const busca = await chamar<{ data: AsaasCustomer[] }>(
    `/customers?cpfCnpj=${encodeURIComponent(cpfLimpo)}&limit=1`
  )
  if (busca.data?.length) return busca.data[0]

  return chamar<AsaasCustomer>('/customers', {
    method: 'POST',
    body: {
      name: dados.nome,
      cpfCnpj: cpfLimpo,
      email: dados.email,
      mobilePhone: dados.telefone?.replace(/\D/g, '') || undefined,
      notificationDisabled: true, // quem fala com o paciente é o Pandorum, não o Asaas
    },
  })
}

// ============================================================
// Subcontas (psicólogos)
// ============================================================

export interface AsaasSubconta {
  id: string
  walletId: string
  apiKey?: string
}

/**
 * Cria a subconta do psicólogo, chamada quando o admin aprova a verificação.
 *
 * ATENÇÃO — bloqueio regulatório: pelas Resoluções Conjuntas 16 e 17 do Banco
 * Central, só conta PESSOA JURÍDICA pode criar subcontas no Asaas. Enquanto a
 * conta-mãe do Pandorum for PF, esta chamada falha em produção. No sandbox
 * funciona normalmente, que é o que permite desenvolver antes do CNPJ.
 */
export async function criarSubcontaPsicologo(dados: {
  nome: string
  email: string
  cpf: string
  nascimento: string
  telefone: string
  rendaMensal: number
  cep: string
  logradouro: string
  numero: string
  complemento?: string | null
  bairro: string
  cidade: string
  estado: string
}): Promise<AsaasSubconta> {
  return chamar<AsaasSubconta>('/accounts', {
    method: 'POST',
    body: {
      name: dados.nome,
      email: dados.email,
      cpfCnpj: dados.cpf.replace(/\D/g, ''),
      birthDate: dados.nascimento,
      mobilePhone: dados.telefone.replace(/\D/g, ''),
      incomeValue: dados.rendaMensal,
      address: dados.logradouro,
      addressNumber: dados.numero,
      complement: dados.complemento || undefined,
      province: dados.bairro,
      postalCode: dados.cep.replace(/\D/g, ''),
      city: dados.cidade,
      state: dados.estado,
    },
  })
}

// ============================================================
// Cobranças
// ============================================================

export interface AsaasPagamento {
  id: string
  status: string
  value: number
  netValue?: number
  billingType: string
  invoiceUrl: string
  dueDate: string
  externalReference?: string
}

/**
 * Data de vencimento da cobrança: o instante em que a janela de cancelamento
 * gratuito se fecha. Ver HORAS_ANTES_VENCIMENTO_COBRANCA para o porquê.
 *
 * O Asaas trabalha com data (não com hora) no vencimento, então uma sessão que
 * começa de manhã cedo pode ter o vencimento caindo no dia anterior. É o lado
 * seguro do arredondamento: cobra-se mais cedo, nunca depois da hora.
 */
export function calcularVencimento(inicioSessao: string | Date): string {
  const inicio = typeof inicioSessao === 'string' ? new Date(inicioSessao) : inicioSessao
  const vencimento = new Date(inicio.getTime() - HORAS_ANTES_VENCIMENTO_COBRANCA * 60 * 60 * 1000)
  const agora = new Date()

  // agendamento em cima da hora: vence hoje, não no passado
  const efetivo = vencimento < agora ? agora : vencimento
  return efetivo.toISOString().slice(0, 10)
}

export async function criarCobrancaSessao(dados: {
  customerId: string
  appointmentId: string
  descricao: string
  inicioSessao: string
  walletIdPsicologo: string
  billingType?: BillingType
}): Promise<AsaasPagamento> {
  return chamar<AsaasPagamento>('/payments', {
    method: 'POST',
    body: {
      customer: dados.customerId,
      billingType: dados.billingType || 'UNDEFINED',
      value: PRECO_SESSAO_PADRAO,
      dueDate: calcularVencimento(dados.inicioSessao),
      description: dados.descricao,
      externalReference: dados.appointmentId,
      split: [
        {
          walletId: dados.walletIdPsicologo,
          fixedValue: REPASSE_PSICOLOGO_SESSAO,
        },
      ],
    },
  })
}

export async function criarCobrancaMultaCancelamento(dados: {
  customerId: string
  appointmentId: string
  descricao: string
  valor: number
  repassePsicologo: number
  walletIdPsicologo: string
}): Promise<AsaasPagamento> {
  const hoje = new Date().toISOString().slice(0, 10)

  return chamar<AsaasPagamento>('/payments', {
    method: 'POST',
    body: {
      customer: dados.customerId,
      billingType: 'UNDEFINED',
      value: dados.valor,
      dueDate: hoje,
      description: dados.descricao,
      externalReference: `multa:${dados.appointmentId}`,
      split: [
        {
          walletId: dados.walletIdPsicologo,
          fixedValue: dados.repassePsicologo,
        },
      ],
    },
  })
}

export async function cancelarCobranca(paymentId: string): Promise<{ deleted: boolean }> {
  return chamar<{ deleted: boolean }>(`/payments/${paymentId}`, { method: 'DELETE' })
}

export async function obterCobranca(paymentId: string): Promise<AsaasPagamento> {
  return chamar<AsaasPagamento>(`/payments/${paymentId}`)
}

// ============================================================
// Saldo da subconta
// ============================================================

/**
 * Saldo da subconta do psicólogo. Consultado com a chave DELE, não com a da
 * plataforma — a conta-mãe não enxerga o saldo da subconta.
 */
export async function obterSaldoSubconta(chaveSubconta: string): Promise<number> {
  const r = await chamar<{ balance: number }>('/finance/balance', { chaveSubconta })
  return r.balance
}
