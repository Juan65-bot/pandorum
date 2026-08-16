'use client'
import { Suspense, useEffect, useState, use } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CreditCard, QrCode, CheckCircle2, Loader2 } from 'lucide-react'
import Header from '@/components/Header'
import { createClient } from '@/lib/supabase/client'
import { formatarDataHora, formatarPreco } from '@/lib/utils'
import type { Appointment } from '@/lib/types'

function PagamentoContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [iniciandoPagamento, setIniciandoPagamento] = useState(false)
  const [erro, setErro] = useState('')
  const supabase = createClient()

  const status = searchParams.get('status')

  useEffect(() => {
    async function carregar() {
      const { data } = await supabase
        .from('appointments')
        .select('*, psychologists(*, profiles(*))')
        .eq('id', id)
        .single()
      setAppointment(data as unknown as Appointment)
      setLoading(false)
    }

    carregar()

    const intervalo = setInterval(async () => {
      const { data } = await supabase.from('appointments').select('status').eq('id', id).single()
      if (data?.status === 'confirmed') {
        carregar()
        clearInterval(intervalo)
      }
    }, 4000)

    return () => clearInterval(intervalo)
  }, [id])

  async function pagar() {
    setIniciandoPagamento(true)
    setErro('')

    const resposta = await fetch('/api/pagamentos/criar-sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: id }),
    })

    const dados = await resposta.json()

    if (!resposta.ok) {
      setErro(dados.error || 'Não foi possível iniciar o pagamento')
      setIniciandoPagamento(false)
      return
    }

    window.location.href = dados.checkout_url
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </main>
    )
  }

  if (!appointment) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Sessão não encontrada.</p>
      </main>
    )
  }

  const preco = appointment.psychologists?.session_price || 0

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/sessoes" />

      <div className="max-w-md mx-auto px-8 py-10">
        <h2 className="text-2xl font-serif text-slate-800 mb-6">Pagamento</h2>

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
          <p className="text-sm text-slate-500 mb-1">Sessão com</p>
          <p className="font-medium text-slate-800 mb-3">{appointment.psychologists?.profiles?.full_name}</p>
          <p className="text-sm text-slate-500 mb-1">Data e horário</p>
          <p className="font-medium text-slate-800 mb-3">{formatarDataHora(appointment.starts_at)}</p>
          <p className="text-sm text-slate-500 mb-1">Valor</p>
          <p className="text-2xl font-serif text-slate-800">{formatarPreco(preco)}</p>
        </div>

        {appointment.status === 'confirmed' ? (
          <div className="flex items-center gap-2 bg-teal-50 text-teal-700 px-4 py-3 rounded-xl text-sm">
            <CheckCircle2 className="w-5 h-5" />
            Pagamento confirmado! Sua sessão está agendada.
          </div>
        ) : (
          <>
            {status === 'sucesso' && (
              <div className="bg-teal-50 text-teal-700 px-4 py-3 rounded-xl text-sm mb-4">
                Estamos confirmando seu pagamento...
              </div>
            )}
            {status === 'cancelado' && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">
                O pagamento foi cancelado. Tente novamente.
              </div>
            )}
            {erro && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm mb-4">{erro}</div>}

            <button
              onClick={pagar}
              disabled={iniciandoPagamento}
              className="w-full flex items-center justify-center gap-2 bg-teal-700 text-white py-3 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50 mb-3"
            >
              {iniciandoPagamento ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {iniciandoPagamento ? 'Redirecionando...' : 'Pagar com PIX ou cartão'}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <QrCode className="w-3.5 h-3.5" />
              Você será redirecionado ao ambiente seguro do Stripe
            </p>
          </>
        )}

        <Link href="/sessoes" className="block text-center text-sm text-teal-700 hover:underline mt-6">
          Voltar para minhas sessões
        </Link>
      </div>
    </main>
  )
}

export default function PagamentoPage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <PagamentoContent {...props} />
    </Suspense>
  )
}
