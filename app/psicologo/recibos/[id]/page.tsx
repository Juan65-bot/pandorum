'use client'
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Printer, ArrowLeft, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { formatarPreco, formatarData, formatarCPF, formatarCRP, capitalizarNome } from '@/lib/utils'

interface Recibo {
  numero: string
  emitidoEm: string
  pagoEm: string | null
  dataSessao: string | null
  valor: number
  paciente: string
  psicologo: string
  crp: string
  cpf: string | null
  taxaCancelamento: boolean
}

/**
 * Recibo de uma sessão, para declaração de imposto.
 *
 * É uma página de impressão, não um PDF gerado no servidor: o navegador já
 * imprime e salva em PDF nativamente, com melhor tipografia e sem adicionar
 * dependência de geração de PDF ao projeto. O @media print abaixo esconde a
 * navegação para o papel sair limpo.
 */
export default function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [recibo, setRecibo] = useState<Recibo | null>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const perfil = await ensureProfile(supabase, user)
      if (perfil?.role !== 'psychologist') { router.push('/dashboard'); return }

      // A RLS de payments só entrega ao psicólogo dono: se o id for de outro,
      // volta vazio e cai no "não encontrado" abaixo.
      const { data: pagamento } = await supabase
        .from('payments')
        .select('id, status, psy_payout, paid_at, is_late_cancellation, patient_id, psychologist_id, appointments(starts_at)')
        .eq('id', id)
        .maybeSingle()

      // só emite recibo do que foi efetivamente pago: um recibo de cobrança
      // pendente afirmaria um recebimento que não aconteceu
      if (!pagamento || pagamento.status !== 'paid') {
        setErro('Recibo não encontrado ou pagamento ainda não confirmado.')
        setCarregando(false)
        return
      }

      const [{ data: pacienteProfile }, { data: psi }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', pagamento.patient_id).maybeSingle(),
        supabase
          .from('psychologists')
          .select('crp_number, crp_region, cpf, full_name_document, profiles!profile_id(full_name)')
          .eq('id', pagamento.psychologist_id)
          .maybeSingle(),
      ])

      const perfilPsi = psi?.profiles as unknown as { full_name: string | null } | null
      const sessao = pagamento.appointments as unknown as { starts_at: string } | null

      setRecibo({
        numero: id.slice(0, 8).toUpperCase(),
        emitidoEm: new Date().toISOString(),
        pagoEm: pagamento.paid_at,
        dataSessao: sessao?.starts_at ?? null,
        valor: Number(pagamento.psy_payout),
        paciente: capitalizarNome(pacienteProfile?.full_name) || 'Paciente',
        psicologo: psi?.full_name_document || capitalizarNome(perfilPsi?.full_name) || 'Psicólogo',
        crp: formatarCRP(psi?.crp_region ?? null, psi?.crp_number ?? null),
        cpf: psi?.cpf ?? null,
        taxaCancelamento: Boolean(pagamento.is_late_cancellation),
      })
      setCarregando(false)
    }
    carregar()
  }, [id])

  if (carregando) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando recibo...
        </span>
      </main>
    )
  }

  if (erro || !recibo) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-5 gap-4">
        <p className="text-slate-600 text-sm text-center">{erro || 'Recibo não encontrado.'}</p>
        <Link href="/psicologo/financeiro" className="text-teal-700 text-sm hover:underline">
          Voltar ao financeiro
        </Link>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-100 py-6 sm:py-10 px-4 print:bg-white print:p-0">
      <style>{`
        @media print {
          .nao-imprimir { display: none !important; }
          @page { margin: 18mm; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto mb-4 flex items-center justify-between nao-imprimir">
        <Link
          href="/psicologo/financeiro"
          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-teal-700"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-teal-700 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Imprimir ou salvar em PDF
        </button>
      </div>

      <article className="max-w-2xl mx-auto bg-white rounded-2xl print:rounded-none shadow-sm print:shadow-none border border-slate-200 print:border-0 p-7 sm:p-10">
        <header className="flex items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <p className="text-xl font-serif text-slate-800">
              Pan<span className="text-teal-600">dorum</span>
            </p>
            <p className="text-xs text-slate-400 mt-0.5">Psicologia online</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Recibo nº</p>
            <p className="text-sm font-mono text-slate-700">{recibo.numero}</p>
          </div>
        </header>

        <h1 className="text-lg font-medium text-slate-800 mt-6 mb-5">
          Recibo de {recibo.taxaCancelamento ? 'taxa de cancelamento' : 'prestação de serviço'}
        </h1>

        <dl className="space-y-3 text-sm">
          <Linha rotulo="Profissional" valor={recibo.psicologo} />
          <Linha rotulo="Registro" valor={recibo.crp} />
          {recibo.cpf && <Linha rotulo="CPF" valor={formatarCPF(recibo.cpf)} />}
          <Linha rotulo="Pago por" valor={recibo.paciente} />
          {recibo.dataSessao && <Linha rotulo="Data da sessão" valor={formatarData(recibo.dataSessao)} />}
          {recibo.pagoEm && <Linha rotulo="Data do pagamento" valor={formatarData(recibo.pagoEm)} />}
        </dl>

        <div className="mt-6 pt-5 border-t border-slate-200 flex items-baseline justify-between">
          <span className="text-sm text-slate-600">Valor recebido</span>
          <span className="text-2xl font-serif text-slate-800">{formatarPreco(recibo.valor)}</span>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed mt-6">
          Referente a {recibo.taxaCancelamento
            ? 'taxa de cancelamento de sessão desmarcada com menos de 24 horas de antecedência'
            : 'uma sessão de psicoterapia realizada de forma online'}
          , intermediada pela plataforma Pandorum. O valor acima é o líquido repassado ao profissional.
        </p>

        <footer className="mt-8 pt-4 border-t border-slate-100 text-[11px] text-slate-400 leading-relaxed">
          <p>Documento gerado eletronicamente em {formatarData(recibo.emitidoEm)}. Dispensa assinatura.</p>
          <p className="mt-1">
            Este recibo comprova o repasse ao profissional. Para fins fiscais, a emissão de nota fiscal, quando
            aplicável, é responsabilidade do próprio profissional.
          </p>
        </footer>
      </article>
    </main>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="text-slate-800 text-right">{valor}</dd>
    </div>
  )
}
