import { z } from 'zod'
import { validarCPF } from '@/lib/utils'
import { UFS } from '@/lib/types'

export const loginSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(1, 'Informe sua senha'),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  tipo: z.enum(['patient', 'psychologist']),
  nome: z.string().min(3, 'Informe seu nome completo'),
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
  password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Informe seu e-mail').email('E-mail inválido'),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'A senha deve ter no mínimo 8 caracteres'),
    confirmPassword: z.string().min(8, 'Confirme sua senha'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'As senhas não coincidem',
    path: ['confirmPassword'],
  })
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const patientProfileSchema = z.object({
  telefone: z.string().optional(),
  nascimento: z.string().optional(),
  genero: z.string().optional(),
  queixa: z.string().max(1000, 'Máximo de 1000 caracteres').optional(),
  // Obrigatório para pagar: o Asaas exige cpfCnpj para criar o cliente da
  // cobrança. Fica opcional no schema porque o paciente pode salvar o perfil
  // antes de agendar; quem exige de fato é a tela de pagamento.
  cpf: z
    .string()
    .optional()
    .refine((v) => !v || validarCPF(v), 'CPF inválido — confira os números digitados'),
})
export type PatientProfileInput = z.infer<typeof patientProfileSchema>

/** CPF do paciente no momento do pagamento, aí sim obrigatório. */
export const cpfObrigatorioSchema = z.object({
  cpf: z.string().refine(validarCPF, 'CPF inválido — confira os números digitados'),
})
export type CpfObrigatorioInput = z.infer<typeof cpfObrigatorioSchema>

/**
 * Perfil profissional público (especialidades, abordagens, bio).
 * CRP e dados de identidade NÃO ficam aqui: são definidos na verificação
 * (verificacaoIdentidadeSchema) e ficam congelados depois de aprovados.
 */
export const psychologistProfileSchema = z.object({
  specialties: z.array(z.string()).min(1, 'Selecione ao menos uma especialidade'),
  approaches: z.array(z.string()).min(1, 'Selecione ao menos uma abordagem'),
  bio: z.string().min(20, 'Escreva uma bio com pelo menos 20 caracteres').max(1000),
})
export type PsychologistProfileInput = z.infer<typeof psychologistProfileSchema>

/** Etapa 1 da verificação: identidade e registro profissional. */
export const verificacaoIdentidadeSchema = z.object({
  full_name_document: z
    .string()
    .min(5, 'Informe o nome completo, exatamente como está no documento')
    .refine((v) => v.trim().split(/\s+/).length >= 2, 'Informe nome e sobrenome'),
  cpf: z.string().refine(validarCPF, 'CPF inválido — confira os números digitados'),
  crp_region: z
    .string()
    .regex(/^\d{2}$/, 'A região do CRP tem 2 dígitos (ex: 06)'),
  crp_number: z
    .string()
    .regex(/^\d{4,8}$/, 'O número do CRP tem entre 4 e 8 dígitos, sem a região'),
  crp_state: z.enum(UFS, { message: 'Selecione o estado do CRP' }),
  birth_date: z
    .string()
    .min(1, 'Informe sua data de nascimento')
    .refine((v) => {
      const data = new Date(v)
      if (Number.isNaN(data.getTime())) return false
      const idade = (Date.now() - data.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      return idade >= 21 && idade <= 100
    }, 'Data de nascimento inválida (a graduação em Psicologia exige no mínimo 21 anos)'),
  phone: z
    .string()
    .refine((v) => v.replace(/\D/g, '').length >= 10, 'Informe um telefone com DDD'),

  // Endereço e renda são exigidos pelo Asaas em POST /v3/accounts para abrir a
  // subconta que recebe o repasse. Sem subconta não existe walletId, e sem
  // walletId não existe split — o psicólogo simplesmente não teria como receber.
  postal_code: z
    .string()
    .refine((v) => v.replace(/\D/g, '').length === 8, 'CEP deve ter 8 dígitos'),
  address_street: z.string().min(3, 'Informe o logradouro'),
  address_number: z.string().min(1, 'Informe o número'),
  address_complement: z.string().max(60).optional(),
  address_district: z.string().min(2, 'Informe o bairro'),
  address_city: z.string().min(2, 'Informe a cidade'),
  address_state: z.enum(UFS, { message: 'Selecione o estado' }),
  // String, não z.coerce.number(): o coerce faz o tipo de ENTRADA do schema
  // virar `unknown`, e o resolver do react-hook-form deixa de casar com o tipo
  // do formulário. A conversão para número acontece na hora de salvar.
  income_value: z
    .string()
    .min(1, 'Informe sua renda mensal')
    .refine((v) => {
      const n = Number(v.replace(/\./g, '').replace(',', '.'))
      return Number.isFinite(n) && n > 0 && n <= 1_000_000
    }, 'Informe um valor mensal válido'),
})
export type VerificacaoIdentidadeInput = z.infer<typeof verificacaoIdentidadeSchema>

/** Etapa 3 da verificação: os quatro aceites obrigatórios. */
export const verificacaoTermosSchema = z.object({
  veracidade: z.literal(true, { message: 'É obrigatório declarar a veracidade das informações' }),
  responsabilidade: z.literal(true, { message: 'É obrigatório declarar ciência da responsabilidade por fraude' }),
  contrato: z.literal(true, { message: 'É obrigatório aceitar o contrato do psicólogo' }),
  privacidade: z.literal(true, { message: 'É obrigatório aceitar a política de privacidade e LGPD' }),
})
export type VerificacaoTermosInput = z.infer<typeof verificacaoTermosSchema>
