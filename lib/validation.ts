import { z } from 'zod'

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
})
export type PatientProfileInput = z.infer<typeof patientProfileSchema>

export const psychologistProfileSchema = z.object({
  crp_number: z.string().min(4, 'Informe um número de CRP válido'),
  specialties: z.array(z.string()).min(1, 'Selecione ao menos uma especialidade'),
  approaches: z.array(z.string()).min(1, 'Selecione ao menos uma abordagem'),
  bio: z.string().min(20, 'Escreva uma bio com pelo menos 20 caracteres').max(1000),
  session_price: z
    .string()
    .min(1, 'Informe um valor de sessão')
    .refine((v) => Number(v) > 0, 'Informe um valor de sessão válido'),
})
export type PsychologistProfileInput = z.infer<typeof psychologistProfileSchema>
