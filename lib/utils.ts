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
