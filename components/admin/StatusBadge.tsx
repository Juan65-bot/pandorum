import { cn } from '@/lib/utils'

type Variante = 'teal' | 'amber' | 'red' | 'slate' | 'purple'

const CORES: Record<Variante, string> = {
  teal: 'bg-teal-50 text-teal-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-red-50 text-red-600',
  slate: 'bg-slate-100 text-slate-600',
  purple: 'bg-purple-50 text-purple-700',
}

const MAPAS: Record<string, Record<string, { label: string; cor: Variante }>> = {
  psicologo: {
    approved: { label: 'Verificado', cor: 'teal' },
    pending_documents: { label: 'Enviando documentos', cor: 'slate' },
    pending_review: { label: 'Aguardando análise', cor: 'amber' },
    pending: { label: 'Pendente', cor: 'amber' },
    rejected: { label: 'Rejeitado', cor: 'red' },
    suspended: { label: 'Suspenso', cor: 'red' },
  },
  sessao: {
    scheduled: { label: 'Pendente', cor: 'amber' },
    confirmed: { label: 'Confirmada', cor: 'teal' },
    completed: { label: 'Concluída', cor: 'slate' },
    cancelled: { label: 'Cancelada', cor: 'red' },
  },
  pagamento: {
    paid: { label: 'Paga', cor: 'teal' },
    pending: { label: 'Não paga', cor: 'amber' },
    failed: { label: 'Falhou', cor: 'red' },
    refunded: { label: 'Reembolsada', cor: 'purple' },
  },
  conta: {
    true: { label: 'Ativo', cor: 'teal' },
    false: { label: 'Inativo', cor: 'slate' },
  },
}

export default function StatusBadge({ tipo, valor }: { tipo: keyof typeof MAPAS; valor: string }) {
  const info = MAPAS[tipo]?.[valor] || { label: valor, cor: 'slate' as Variante }
  return (
    <span className={cn('inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap', CORES[info.cor])}>
      {info.label}
    </span>
  )
}
