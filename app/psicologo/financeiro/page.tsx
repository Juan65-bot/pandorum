'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Wallet, TrendingUp, Receipt, Bell, Loader2, AlertCircle,
  ArrowUpRight, Check, Info, FileText,
} from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { formatarPreco, formatarData, cn } from '@/lib/utils'
import {
  PREFERENCIAS_LEMBRETE_SAQUE,
  REPASSE_PSICOLOGO_SESSAO,
  type PreferenciaLembreteSaque,
} from '@/lib/types'

type StatusPagamento = 'paid' | 'pending' | 'failed' | 'refunded'

interface LinhaExtrato {
  id: string
  status: StatusPagamento
  data: string | null
  vencimento: string | null
  dataSessao: string | null
  paciente: string
  valorRecebido: number
  meioPagamento: string | null
  taxaDeCancelamento: boolean
  appointmentId: string
}

interface DadosFinanceiros {
  saldo: number | null
  saldoIndisponivel: string | null
  totalMes: number
  totalMesAnterior: number
  diferencaMeses: number
  aguardandoPagamento: number
  extrato: LinhaExtrato[]
}

/** Rótulo e cor de cada status, na voz de quem recebe — não na do gateway. */
const STATUS: Record<StatusPagamento, { label: string; classe: string }> = {
  paid: { label: 'Recebido', classe: 'bg-teal-50 text-teal-700' },
  pending: { label: 'Aguardando pagamento', classe: 'bg-amber-50 text-amber-700' },
  failed: { label: 'Não pago', classe: 'bg-slate-100 text-slate-500' },
  refunded: { label: 'Estornado', classe: 'bg-purple-50 text-purple-700' },
}

export default function FinanceiroPsicologoPage() {
  const [dados, setDados] = useState<DadosFinanceiros | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [preferencia, setPreferencia] = useState<PreferenciaLembreteSaque>('semanal')
  const [salvandoPref, setSalvandoPref] = useState(false)
  const [prefSalva, setPrefSalva] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const perfil = await ensureProfile(supabase, user)
      if (perfil?.role !== 'psychologist') { router.push('/dashboard'); return }

      const { data: psi } = await supabase
        .from('psychologists')
        .select('withdrawal_reminder')
        .eq('profile_id', user.id)
        .maybeSingle()
      if (psi?.withdrawal_reminder) setPreferencia(psi.withdrawal_reminder as PreferenciaLembreteSaque)

      const resposta = await fetch('/api/psicologo/financeiro')
      const json = await resposta.json()

      if (!resposta.ok) {
        setErro(json.error || 'Não foi possível carregar seus dados financeiros.')
        setCarregando(false)
        return
      }

      setDados(json)
      setCarregando(false)
    }
    carregar()
  }, [])

  async function salvarPreferencia(nova: PreferenciaLembreteSaque) {
    const anterior = preferencia
    setPreferencia(nova)
    setSalvandoPref(true)
    setPrefSalva(false)

    const resposta = await fetch('/api/psicologo/lembrete-saque', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferencia: nova }),
    })

    setSalvandoPref(false)

    if (!resposta.ok) {
      // volta ao valor anterior: mostrar selecionado algo que não foi salvo
      // faria ele acreditar que vai receber um lembrete que nunca virá
      setPreferencia(anterior)
      setErro('Não foi possível salvar sua preferência de lembrete.')
      return
    }

    setPrefSalva(true)
    setTimeout(() => setPrefSalva(false), 2500)
  }

  if (carregando) {
    return (
      <main className="min-h-screen bg-slate-50">
        <Header backHref="/psicologo/dashboard" />
        <div className="max-w-3xl mx-auto px-5 sm:px-8 py-10 flex items-center justify-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          Carregando seus dados financeiros...
        </div>
      </main>
    )
  }

  const variacao =
    dados && dados.totalMesAnterior > 0
      ? Math.round(((dados.totalMes - dados.totalMesAnterior) / dados.totalMesAnterior) * 100)
      : null

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/psicologo/dashboard" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-slate-800 mb-1">Financeiro</h1>
          <p className="text-slate-500 text-sm">
            Você recebe {formatarPreco(REPASSE_PSICOLOGO_SESSAO)} por sessão paga, direto na sua conta de recebimento.
          </p>
        </div>

        {erro && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            {erro}
          </div>
        )}

        {/* ---------- saldo ---------- */}
        <section className="bg-gradient-to-br from-teal-800 to-teal-900 text-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 text-teal-200 text-xs mb-2">
            <Wallet className="w-4 h-4" aria-hidden="true" />
            Disponível para saque
          </div>

          {dados?.saldo !== null && dados?.saldo !== undefined ? (
            <>
              <p className="text-3xl sm:text-4xl font-serif">{formatarPreco(dados.saldo)}</p>
              <p className="text-teal-200/80 text-xs mt-2">
                Você pode sacar quando quiser — não há prazo nem valor mínimo.
              </p>
            </>
          ) : (
            <>
              <p className="text-xl font-serif text-teal-100">—</p>
              <p className="text-teal-200/80 text-xs mt-2">
                {dados?.saldoIndisponivel || 'Saldo indisponível no momento.'}
              </p>
            </>
          )}

          {/* Fora do if/else de propósito: enquanto não existir subconta o saldo
              fica indisponível, e o valor a receber é justamente a informação
              que sobra para ele se orientar. Dentro do ramo do saldo, essa linha
              nunca apareceria para quem mais precisa dela. */}
          {!!dados?.aguardandoPagamento && dados.aguardandoPagamento > 0 && (
            <p className="text-teal-200/70 text-xs mt-3 pt-3 border-t border-white/10">
              Mais {formatarPreco(dados.aguardandoPagamento)} em sessões aguardando pagamento do paciente.
            </p>
          )}
        </section>

        {/* ---------- totais ---------- */}
        <section className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-2">
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
              Este mês
            </div>
            <p className="text-xl sm:text-2xl font-serif text-slate-800">{formatarPreco(dados?.totalMes ?? 0)}</p>
            {dados && (dados.totalMes > 0 || dados.totalMesAnterior > 0) && (
              <p className={cn('text-xs mt-1', dados.diferencaMeses >= 0 ? 'text-teal-600' : 'text-slate-500')}>
                {dados.diferencaMeses >= 0 ? '+' : '−'}
                {formatarPreco(Math.abs(dados.diferencaMeses))}
                {variacao !== null && ` (${variacao >= 0 ? '+' : ''}${variacao}%)`}
                {' '}vs. mês passado
              </p>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4 sm:p-5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-2">
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
              Mês passado
            </div>
            <p className="text-xl sm:text-2xl font-serif text-slate-800">{formatarPreco(dados?.totalMesAnterior ?? 0)}</p>
          </div>
        </section>

        {/* ---------- extrato ---------- */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <h2 className="text-sm font-medium text-slate-700">Extrato por sessão</h2>
          </div>

          {!dados?.extrato.length ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-slate-400">Nenhum recebimento ainda.</p>
              <p className="text-xs text-slate-400 mt-1">
                Assim que um paciente pagar uma sessão, ela aparece aqui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {dados.extrato.map((linha) => {
                const st = STATUS[linha.status]
                const recebido = linha.status === 'paid'
                return (
                  <li key={linha.id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800 truncate flex items-center gap-2 flex-wrap">
                        {linha.paciente}
                        <span className={cn('text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap', st.classe)}>
                          {st.label}
                        </span>
                        <span
                          className={cn(
                            'text-[11px] px-1.5 py-0.5 rounded-full whitespace-nowrap',
                            linha.taxaDeCancelamento ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-500'
                          )}
                        >
                          {linha.taxaDeCancelamento ? 'taxa de cancelamento' : 'sessão'}
                        </span>
                      </p>
                      <p className="text-xs text-slate-400">
                        {recebido && linha.data
                          ? `recebido em ${formatarData(linha.data)}`
                          : linha.vencimento
                            ? `vence em ${formatarData(linha.vencimento)}`
                            : '—'}
                        {linha.dataSessao && ` · sessão em ${formatarData(linha.dataSessao)}`}
                        {linha.meioPagamento === 'PIX' && ' · PIX'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={cn('text-sm font-medium tabular-nums', recebido ? 'text-teal-700' : 'text-slate-400')}>
                        {formatarPreco(linha.valorRecebido)}
                      </span>
                      {/* Recibo só do que foi pago: emitir recibo de cobrança
                          pendente afirmaria um recebimento que não aconteceu. */}
                      {recebido ? (
                        <Link
                          href={`/psicologo/recibos/${linha.id}`}
                          title="Ver recibo"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-700 hover:bg-teal-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        >
                          <FileText className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Recibo de {linha.paciente}</span>
                        </Link>
                      ) : (
                        <span className="w-7" aria-hidden="true" />
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* ---------- lembrete ---------- */}
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-1">
            <Bell className="w-4 h-4 text-slate-400" aria-hidden="true" />
            <h2 className="text-sm font-medium text-slate-700">Lembrete de saque</h2>
          </div>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            Quando quer receber um e-mail avisando que há saldo disponível. É só um lembrete —{' '}
            <strong className="text-slate-600">você pode sacar quando quiser, a qualquer momento</strong>, e nunca
            existe bloqueio.
          </p>

          <fieldset className="space-y-2">
            <legend className="sr-only">Frequência do lembrete de saque</legend>
            {PREFERENCIAS_LEMBRETE_SAQUE.map((opcao) => (
              <label
                key={opcao.valor}
                className={cn(
                  'flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors',
                  preferencia === opcao.valor
                    ? 'border-teal-300 bg-teal-50/60'
                    : 'border-slate-200 hover:border-slate-300'
                )}
              >
                <input
                  type="radio"
                  name="lembrete"
                  value={opcao.valor}
                  checked={preferencia === opcao.valor}
                  onChange={() => salvarPreferencia(opcao.valor)}
                  disabled={salvandoPref}
                  className="mt-0.5 w-4 h-4 accent-teal-700 flex-shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm text-slate-800">{opcao.label}</span>
                  <span className="block text-xs text-slate-500">{opcao.descricao}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="h-5 mt-3" aria-live="polite">
            {salvandoPref && (
              <span className="flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Salvando...
              </span>
            )}
            {prefSalva && (
              <span className="flex items-center gap-1.5 text-xs text-teal-700">
                <Check className="w-3 h-3" aria-hidden="true" /> Preferência salva
              </span>
            )}
          </div>
        </section>

        <p className="flex items-start gap-2 text-xs text-slate-400 leading-relaxed">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            O saque em si acontece na sua conta Asaas, para a conta bancária que você cadastrou lá.
            <a
              href="https://www.asaas.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-700 hover:underline inline-flex items-center gap-0.5 ml-1"
            >
              Abrir o Asaas <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </a>
          </span>
        </p>
      </div>
    </main>
  )
}
