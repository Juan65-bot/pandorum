import { notFound } from 'next/navigation'
import { Star, BadgeCheck, Check } from 'lucide-react'
import Header from '@/components/Header'
import BookingCalendar from '@/components/BookingCalendar'
import { createClient } from '@/lib/supabase/server'
import { formatarPreco } from '@/lib/utils'
import { DURACAO_SESSAO_MINUTOS, type Psychologist } from '@/lib/types'

export default async function PsicologoDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('psychologists')
    .select('*, profiles!profile_id(*)')
    .eq('id', id)
    .eq('status', 'approved')
    .maybeSingle()

  if (!data) notFound()

  const psicologo = data as unknown as Psychologist
  const foto = psicologo.profiles?.avatar_url

  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/psicologos" backLabel="Ver outros psicólogos" />

      <div className="max-w-4xl mx-auto px-8 py-10 grid grid-cols-3 gap-8">
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-medium text-2xl overflow-hidden flex-shrink-0">
                {foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={foto} alt={psicologo.profiles?.full_name || ''} className="w-full h-full object-cover" />
                ) : (
                  psicologo.profiles?.full_name?.[0] || 'P'
                )}
              </div>
              <div>
                <h1 className="text-xl font-medium text-slate-800 flex items-center gap-1.5">
                  {psicologo.profiles?.full_name || 'Psicólogo'}
                  <BadgeCheck className="w-5 h-5 text-teal-600" />
                </h1>
                <p className="text-sm text-slate-400">CRP {psicologo.crp_number}</p>
                {psicologo.rating_count > 0 && (
                  <div className="flex items-center gap-1 text-sm text-amber-500 mt-1">
                    <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                    {psicologo.rating_avg} · {psicologo.rating_count} avaliações
                  </div>
                )}
              </div>
            </div>

            {psicologo.specialties && psicologo.specialties.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-3">
                {psicologo.specialties.map((s) => (
                  <span key={s} className="text-xs bg-teal-50 text-teal-700 px-2 py-1 rounded-full">
                    {s}
                  </span>
                ))}
              </div>
            )}

            {psicologo.approaches && psicologo.approaches.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-4">
                {psicologo.approaches.map((a) => (
                  <span key={a} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                    {a}
                  </span>
                ))}
              </div>
            )}

            {psicologo.bio && <p className="text-sm text-slate-600 leading-relaxed">{psicologo.bio}</p>}
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="font-medium text-slate-800 mb-4">Agendar sessão</h2>
            <BookingCalendar psychologistId={psicologo.id} sessionPrice={psicologo.session_price || 0} />
          </div>
        </div>

        <aside>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 sticky top-6">
            <div className="text-2xl font-serif text-slate-800 mb-1">
              {psicologo.session_price ? formatarPreco(psicologo.session_price) : '—'}
            </div>
            <p className="text-xs text-slate-400 mb-4">por sessão de {DURACAO_SESSAO_MINUTOS} minutos</p>
            <ul className="text-xs text-slate-500 space-y-2">
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-teal-600" /> Sessão 100% online por videochamada</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-teal-600" /> Pagamento seguro via PIX ou cartão</li>
              <li className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-teal-600" /> Cancelamento gratuito com 24h de antecedência</li>
            </ul>
          </div>
        </aside>
      </div>
    </main>
  )
}
