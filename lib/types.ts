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

export type PsychologistStatus = 'pending' | 'approved' | 'rejected'

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
  profiles?: Profile
}

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
  stripe_payment_id: string | null
  paid_at: string | null
}

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
