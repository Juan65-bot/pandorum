export type Role = 'patient' | 'psychologist' | 'admin'

export interface Profile {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: Role
  avatar_url: string | null
  is_active: boolean
  created_at: string
}

export interface Patient {
  id: string
  profile_id: string
  birth_date: string | null
  gender: string | null
  main_complaint: string | null
  emergency_contact: Record<string, unknown> | null
}

/**
 * 'pending' é legado (ver migration 0013): continua no enum do Postgres porque
 * valor de enum não se remove, mas nenhuma linha usa mais — o estado inicial
 * agora é 'pending_documents'.
 */
export type PsychologistStatus =
  | 'pending'
  | 'pending_documents'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'suspended'

export interface Psychologist {
  id: string
  profile_id: string | null
  crp_number: string | null
  status: PsychologistStatus
  specialties: string[] | null
  approaches: string[] | null
  bio: string | null
  session_price: number | null
  rating_avg: number
  rating_count: number
  approved_at: string | null
  approved_by: string | null
  full_name_document: string | null
  cpf: string | null
  crp_region: string | null
  crp_state: string | null
  birth_date: string | null
  documents_submitted_at: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  additional_document_request: string | null
  verification_terms_accepted_at: string | null
  verification_terms_version: string | null
  asaas_wallet_id: string | null
  asaas_account_id: string | null
  asaas_account_error: string | null
  postal_code: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_district: string | null
  address_city: string | null
  address_state: string | null
  income_value: number | null
  withdrawal_reminder: PreferenciaLembreteSaque | null
  profiles?: Profile
}

export type DocumentType = 'crp_card' | 'id_front' | 'id_back' | 'selfie_document' | 'diploma'

export interface PsychologistDocument {
  id: string
  psychologist_id: string
  doc_type: DocumentType
  storage_path: string
  mime_type: string | null
  file_size: number | null
  uploaded_at: string
}

/** Os 5 documentos obrigatórios, na ordem em que aparecem no formulário e na análise. */
export const DOCUMENTOS_OBRIGATORIOS: {
  tipo: DocumentType
  label: string
  descricao: string
}[] = [
  {
    tipo: 'crp_card',
    label: 'Carteira do CRP (frente)',
    descricao: 'Foto nítida da frente da sua carteira profissional emitida pelo Conselho Regional de Psicologia.',
  },
  {
    tipo: 'id_front',
    label: 'Documento oficial com foto — frente',
    descricao: 'RG ou CNH. A foto e o número precisam estar legíveis.',
  },
  {
    tipo: 'id_back',
    label: 'Documento oficial com foto — verso',
    descricao: 'O verso do mesmo documento enviado acima.',
  },
  {
    tipo: 'selfie_document',
    label: 'Selfie segurando o documento',
    descricao: 'Uma foto sua segurando o documento oficial ao lado do rosto, com o rosto e o documento visíveis.',
  },
  {
    tipo: 'diploma',
    label: 'Diploma de graduação em Psicologia',
    descricao: 'Foto ou digitalização do diploma. Certificado de conclusão também é aceito.',
  },
]

export type VerificationAction =
  | 'approved'
  | 'rejected'
  | 'requested_document'
  | 'suspended'
  | 'reinstated'

export interface VerificationAuditLog {
  id: string
  psychologist_id: string
  admin_id: string | null
  admin_name: string | null
  action: VerificationAction
  checklist: Record<string, boolean> | null
  reason: string | null
  previous_status: string | null
  new_status: string | null
  created_at: string
}

/** Itens que o admin precisa marcar antes de conseguir aprovar um cadastro. */
export const CHECKLIST_VERIFICACAO = [
  { chave: 'crp_confere', label: 'CRP confere no site do CFP e está ativo' },
  { chave: 'nome_confere', label: 'Nome do documento bate com o nome do cadastro' },
  { chave: 'selfie_confere', label: 'Selfie corresponde à foto do documento' },
  { chave: 'diploma_confere', label: 'Diploma confere com o nome' },
] as const

/**
 * Busca do Cadastro Nacional de Psicólogos (CFP), já com o CRP preenchido —
 * é onde o admin confirma que o registro existe e está ativo.
 */
export function urlConsultaCFP(crpNumero: string) {
  const somenteDigitos = (crpNumero || '').replace(/\D/g, '')
  return `https://cadastro.cfp.org.br/lista?registro=${encodeURIComponent(somenteDigitos)}`
}

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'completed' | 'cancelled'

export interface Appointment {
  id: string
  patient_id: string
  psychologist_id: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  video_room_url: string | null
  cancelled_reason: string | null
  created_at: string
  patients_profile?: Profile
  psychologists?: Psychologist
}

export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed'

export interface Payment {
  id: string
  patient_id: string
  psychologist_id: string
  appointment_id: string
  amount_total: number
  platform_fee: number
  psy_payout: number
  status: PaymentStatus
  gateway_payment_id: string | null
  gateway_invoice_url: string | null
  billing_type: BillingType | null
  net_value: number | null
  due_date: string | null
  paid_at: string | null
  is_late_cancellation: boolean
  refunded_amount: number
  cancellation_fee: number
}

/** Meios de pagamento aceitos. UNDEFINED deixa o paciente escolher no checkout do Asaas. */
export type BillingType = 'PIX' | 'CREDIT_CARD' | 'UNDEFINED'

/** Quando o psicólogo quer ser lembrado de que há saldo para sacar. */
export type PreferenciaLembreteSaque = 'imediato' | 'semanal' | 'mensal' | 'nunca'

export const PREFERENCIAS_LEMBRETE_SAQUE: {
  valor: PreferenciaLembreteSaque
  label: string
  descricao: string
}[] = [
  { valor: 'imediato', label: 'Assim que entrar', descricao: 'Um e-mail sempre que um pagamento cair na sua conta.' },
  { valor: 'semanal', label: 'Toda sexta-feira', descricao: 'Um resumo semanal do que está disponível para saque.' },
  { valor: 'mensal', label: 'Dia 20 de cada mês', descricao: 'Um lembrete mensal, perto do fechamento.' },
  { valor: 'nunca', label: 'Não quero lembretes', descricao: 'Você continua podendo sacar quando quiser.' },
]

export interface AvailabilitySlot {
  id: string
  psychologist_id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_recurring: boolean
  specific_date: string | null
}

export interface Review {
  id: string
  appointment_id: string
  patient_id: string
  psychologist_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface SessionNote {
  id: string
  appointment_id: string
  psychologist_id: string
  content_encrypted: string | null
  mood_score: number | null
  next_steps: string | null
  created_at: string
}

export const ESPECIALIDADES = [
  'Ansiedade',
  'Depressão',
  'Relacionamentos',
  'Estresse no trabalho',
  'Autoestima',
  'Luto',
  'TDAH',
  'TOC',
  'Transtornos alimentares',
  'Terapia de casal',
  'Infância e adolescência',
  'Dependência química',
] as const

export const ABORDAGENS = [
  'Terapia Cognitivo-Comportamental',
  'Psicanálise',
  'Terapia Humanista',
  'Gestalt-terapia',
  'Terapia Sistêmica',
  'ACT (Terapia de Aceitação e Compromisso)',
  'EMDR',
] as const

export const DIAS_SEMANA = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const

export const DURACAO_SESSAO_MINUTOS = 50

/** Valor fixo por sessão, definido pela plataforma — psicólogos não podem alterar. */
export const PRECO_SESSAO_PADRAO = 150

/**
 * Repartição do dinheiro. Tudo em REAIS, nunca em percentual — e isso é decisão
 * de arquitetura, não estilo.
 *
 * No split do Asaas, um `percentualValue` incide sobre o valor JÁ DESCONTADO das
 * taxas do gateway. Como a taxa do PIX (fixa) e a do cartão (percentual) são
 * diferentes, o mesmo percentual entregaria valores distintos ao psicólogo
 * conforme o meio de pagamento escolhido pelo paciente — algo que ele não
 * controla e não teria como prever. Com `fixedValue`, o psicólogo recebe sempre
 * exatamente o mesmo, e a taxa do gateway sai inteira da parte da plataforma.
 *
 * Estas constantes moram aqui (e não em lib/asaas.ts) porque telas client
 * precisam delas para exibir os valores antes de confirmar; importar de
 * lib/asaas arrastaria código de servidor para o bundle do browser.
 */

/** O psicólogo recebe isto por sessão paga, independente do meio de pagamento. */
export const REPASSE_PSICOLOGO_SESSAO = 100

/** Fica com a plataforma por sessão, ANTES de descontar a taxa do gateway. */
export const RETENCAO_PLATAFORMA_SESSAO = PRECO_SESSAO_PADRAO - REPASSE_PSICOLOGO_SESSAO

/** Cobrado do paciente quando ele cancela com menos de 24h (50% da sessão). */
export const VALOR_MULTA_CANCELAMENTO_TARDIO = 75

/** Parte da multa que vai para o psicólogo — mesma proporção de uma sessão realizada. */
export const REPASSE_PSICOLOGO_CANCELAMENTO = 50

/** Parte da multa que fica com a plataforma, antes da taxa do gateway. */
export const RETENCAO_PLATAFORMA_CANCELAMENTO =
  VALOR_MULTA_CANCELAMENTO_TARDIO - REPASSE_PSICOLOGO_CANCELAMENTO

/**
 * Antecedência mínima com que a cobrança vence, em horas antes da sessão.
 *
 * A cobrança é criada no agendamento mas só vence aqui, e é isso que fecha o
 * buraco do estorno: como o split do Asaas é instantâneo, dinheiro que entrasse
 * no agendamento já estaria na conta do psicólogo dias antes da sessão, e um
 * cancelamento gratuito exigiria puxar de volta um valor que ele talvez já
 * tivesse sacado. Vencendo junto com o fim da janela de cancelamento gratuito,
 * quem cancela a tempo simplesmente nunca pagou.
 */
export const HORAS_ANTES_VENCIMENTO_COBRANCA = 24
