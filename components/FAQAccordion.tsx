'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const PERGUNTAS = [
  {
    pergunta: 'Como funciona o pagamento das sessões?',
    resposta:
      'Você paga com segurança via PIX ou cartão de crédito na hora de agendar. A sessão só é confirmada depois que o pagamento é aprovado.',
  },
  {
    pergunta: 'Os psicólogos são verificados?',
    resposta:
      'Sim. Todo psicólogo cadastrado passa por uma verificação manual do número de registro no CRP antes de aparecer na busca da plataforma.',
  },
  {
    pergunta: 'Posso cancelar ou remarcar uma sessão?',
    resposta:
      'Sim, você pode cancelar gratuitamente com até 24h de antecedência diretamente na página "Minhas sessões".',
  },
  {
    pergunta: 'As sessões online são sigilosas?',
    resposta:
      'Sim. As videochamadas acontecem em uma sala privada, exclusiva para você e o profissional, e nenhuma sessão é gravada pela plataforma.',
  },
  {
    pergunta: 'Preciso instalar algum aplicativo?',
    resposta:
      'Não. O Pandorum funciona direto no navegador, no computador ou no celular — não é necessário baixar nada.',
  },
] as const

export default function FAQAccordion() {
  const [aberta, setAberta] = useState<number | null>(0)

  return (
    <div className="max-w-2xl mx-auto divide-y divide-slate-100">
      {PERGUNTAS.map((item, i) => {
        const estaAberta = aberta === i
        return (
          <div key={item.pergunta}>
            <button
              onClick={() => setAberta(estaAberta ? null : i)}
              className="w-full flex items-center justify-between gap-4 py-5 text-left"
            >
              <span className="font-medium text-slate-800">{item.pergunta}</span>
              <ChevronDown className={cn('w-4 h-4 text-slate-400 flex-shrink-0 transition-transform', estaAberta && 'rotate-180')} />
            </button>
            {estaAberta && <p className="text-sm text-slate-500 leading-relaxed pb-5 pr-8">{item.resposta}</p>}
          </div>
        )
      })}
    </div>
  )
}
