import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatarPreco(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarData(data: string | Date) {
  return new Date(data).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}

export function formatarHora(data: string | Date) {
  return new Date(data).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatarDataHora(data: string | Date) {
  return `${formatarData(data)} às ${formatarHora(data)}`
}

/**
 * Valida CPF pelos dígitos verificadores. Não prova que o CPF existe na Receita,
 * mas descarta número digitado errado e sequências óbvias (111.111.111-11),
 * que é o que a maioria de quem tenta fraudar o cadastro digita.
 */
export function validarCPF(valor: string): boolean {
  const cpf = (valor || '').replace(/\D/g, '')
  if (cpf.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cpf)) return false

  for (const [tamanho, posicao] of [[9, 10], [10, 11]] as const) {
    let soma = 0
    for (let i = 0; i < tamanho; i++) {
      soma += Number(cpf[i]) * (posicao - i)
    }
    const resto = (soma * 10) % 11
    const digito = resto === 10 || resto === 11 ? 0 : resto
    if (digito !== Number(cpf[tamanho])) return false
  }

  return true
}

export function formatarCPF(valor: string): string {
  const cpf = (valor || '').replace(/\D/g, '').slice(0, 11)
  return cpf
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

/** Monta o CRP no formato oficial "CRP 06/123456" a partir da região e do número. */
export function formatarCRP(regiao: string | null, numero: string | null): string {
  if (!numero) return '—'
  const limpo = numero.replace(/\D/g, '')
  if (!regiao) return `CRP ${numero}`
  return `CRP ${regiao.padStart(2, '0')}/${limpo}`
}

export function formatarTamanhoArquivo(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CONECTIVOS_MINUSCULOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/** Corrige a capitalização de nomes próprios em português (ex: "isa silva" -> "Isa Silva"). */
export function capitalizarNome(nome: string | null | undefined): string {
  if (!nome) return ''
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((palavra, i) => {
      if (i > 0 && CONECTIVOS_MINUSCULOS.has(palavra)) return palavra
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(' ')
}
