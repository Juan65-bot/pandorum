'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileCheck, ShieldCheck, Percent, HeartHandshake } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { formatarPreco } from '@/lib/utils'
import {
  PRECO_SESSAO_PADRAO,
  REPASSE_PSICOLOGO_SESSAO,
  RETENCAO_PLATAFORMA_SESSAO,
  REPASSE_PSICOLOGO_CANCELAMENTO,
  VALOR_MULTA_CANCELAMENTO_TARDIO,
} from '@/lib/types'

// 2.0: repasse deixou de ser 70% e virou R$ 100 fixos por sessão (troca do
// gateway para o Asaas). Quem aceitou a 1.0 concordou com outra coisa.
const VERSAO_TERMOS = '2.0'

export default function TermosPsicologoPage() {
  const [aceito, setAceito] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [loading, setLoading] = useState(true)
  const [jaAceitou, setJaAceitou] = useState(false)
  const [precisaReaceitar, setPrecisaReaceitar] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      const profile = await ensureProfile(supabase, user)
      if (profile?.role !== 'psychologist') {
        router.push('/dashboard')
        return
      }

      // Aceite vale por VERSÃO, não pela mera existência de uma data. Quem
      // aceitou a 1.0 concordou com repasse de 70%; a 2.0 diz R$ 100 fixos.
      // Tratar os dois como equivalentes seria afirmar que ele aceitou termos
      // financeiros que nunca leu.
      if (user.user_metadata?.terms_accepted_at && user.user_metadata?.terms_version === VERSAO_TERMOS) {
        setJaAceitou(true)
      } else if (user.user_metadata?.terms_accepted_at) {
        setPrecisaReaceitar(true)
      }

      setLoading(false)
    }
    carregar()
  }, [])

  async function continuar() {
    setEnviando(true)
    await supabase.auth.updateUser({
      data: { terms_accepted_at: new Date().toISOString(), terms_version: VERSAO_TERMOS },
    })
    // navegação completa (não client-side) para garantir que a próxima página
    // carregue com a sessão já atualizada, evitando condição de corrida com o
    // evento USER_UPDATED do Supabase
    window.location.href = '/psicologo/verificacao'
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/dashboard" />

      <div className="max-w-2xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <h2 className="text-3xl font-serif text-slate-800 mb-2">Contrato de parceria profissional</h2>
        <p className="text-slate-500 text-sm mb-8">
          Antes de completar seu cadastro, leia e aceite os termos abaixo para atender pacientes pelo Pandorum.
        </p>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 mb-6">
          <Secao
            icone={<FileCheck className="w-4 h-4" />}
            titulo="1. Termos de uso"
          >
            <p>
              Ao se cadastrar como psicólogo(a) no Pandorum, você declara possuir registro ativo no Conselho Regional
              de Psicologia (CRP) e concorda em manter suas informações profissionais (número de CRP, especialidades,
              abordagens e valor da sessão) atualizadas e verídicas.
            </p>
            <p>
              A plataforma se reserva o direito de revisar, suspender ou encerrar contas que violem as normas éticas
              do Conselho Federal de Psicologia (CFP) ou os termos de uso da plataforma.
            </p>
          </Secao>

          <Secao
            icone={<ShieldCheck className="w-4 h-4" />}
            titulo="2. Privacidade e proteção de dados (LGPD)"
          >
            <p>
              Dados de pacientes acessados durante o atendimento (identificação, contato e anotações de sessão) são
              tratados como dados sensíveis nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e devem
              ser usados exclusivamente para fins de atendimento clínico.
            </p>
            <p>
              É vedado compartilhar, exportar ou reutilizar dados de pacientes fora da plataforma sem consentimento
              explícito do paciente e amparo legal ou ético para tanto.
            </p>
          </Secao>

          <Secao
            icone={<HeartHandshake className="w-4 h-4" />}
            titulo="3. Consentimento para atendimento online"
          >
            <p>
              Você concorda em obter o consentimento informado de cada paciente para atendimento psicológico mediado
              por tecnologia, conforme a Resolução CFP nº 11/2018, incluindo esclarecimentos sobre a natureza remota
              do atendimento e seus limites.
            </p>
            <p>
              As sessões ocorrem por videochamada ponto-a-ponto e não são gravadas ou armazenadas pela plataforma.
            </p>
          </Secao>

          <Secao
            icone={<Percent className="w-4 h-4" />}
            titulo="4. Quanto você recebe"
          >
            <p>
              A sessão custa <strong>{formatarPreco(PRECO_SESSAO_PADRAO)}</strong> ao paciente e você recebe{' '}
              <strong>{formatarPreco(REPASSE_PSICOLOGO_SESSAO)} por sessão paga</strong>. É um valor fixo: não muda
              conforme o paciente escolha pagar por PIX ou cartão. Os {formatarPreco(RETENCAO_PLATAFORMA_SESSAO)}{' '}
              restantes ficam com o Pandorum e é de onde saem as taxas do meio de pagamento, a divulgação do seu perfil
              e a infraestrutura da videochamada.
            </p>
            <p>
              O repasse é <strong>automático e direto</strong>: quando o paciente paga, sua parte cai na sua conta de
              recebimento no mesmo instante, sem depender de fechamento de mês. Você saca quando quiser.
            </p>
            <p>
              Em caso de cancelamento do paciente com menos de 24 horas de antecedência, é cobrada uma taxa de{' '}
              {formatarPreco(VALOR_MULTA_CANCELAMENTO_TARDIO)}, da qual{' '}
              <strong>{formatarPreco(REPASSE_PSICOLOGO_CANCELAMENTO)} são repassados a você</strong> — o horário foi
              reservado e não pôde ser oferecido a outro paciente. Cancelamentos feitos por você nunca geram cobrança
              ao paciente. Detalhes em{' '}
              <Link href="/politica-de-cancelamento" className="text-teal-700 underline">
                política de cancelamento
              </Link>.
            </p>
          </Secao>
        </div>

        {jaAceitou && (
          <div className="bg-teal-50 text-teal-700 text-sm px-4 py-3 rounded-xl mb-6">
            Você já aceitou esses termos anteriormente. Pode seguir para completar seu perfil.
          </div>
        )}

        {precisaReaceitar && (
          <div className="bg-amber-50 text-amber-800 text-sm px-4 py-3 rounded-xl mb-6">
            <strong>O contrato mudou desde que você aceitou.</strong> A forma de repasse deixou de ser um percentual e
            passou a ser um valor fixo por sessão. Leia a seção 4 e aceite novamente para continuar atendendo.
          </div>
        )}

        <label className="flex items-start gap-3 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={aceito || jaAceitou}
            onChange={(e) => setAceito(e.target.checked)}
            disabled={jaAceitou}
            className="mt-0.5 w-4 h-4 accent-teal-700"
          />
          <span className="text-sm text-slate-600">
            Li e aceito os Termos de Uso, a Política de Privacidade, o consentimento para atendimento online e a
            forma de repasse descrita acima.
          </span>
        </label>

        <button
          onClick={continuar}
          disabled={(!aceito && !jaAceitou) || enviando}
          className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
        >
          {enviando ? 'Salvando...' : 'Aceitar e continuar'}
        </button>
      </div>
    </main>
  )
}

function Secao({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div className="p-6">
      <h3 className="flex items-center gap-2 font-medium text-slate-800 mb-3">
        <span className="text-teal-600">{icone}</span>
        {titulo}
      </h3>
      <div className="text-sm text-slate-500 leading-relaxed space-y-2">{children}</div>
    </div>
  )
}
