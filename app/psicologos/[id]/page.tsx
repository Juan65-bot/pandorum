import { notFound } from 'next/navigation'
import { Star, BadgeCheck, Check, ShieldCheck } from 'lucide-react'
import Header from '@/components/Header'
import BookingCalendar from '@/components/BookingCalendar'
import { createClient } from '@/lib/supabase/server'
import { formatarPreco, capitalizarNome, formatarCRP, formatarData } from '@/lib/utils'
import { DURACAO_SESSAO_MINUTOS, PRECO_SESSAO_PADRAO, type Psychologist } from '@/lib/types'

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
  const nome = capitalizarNome(psicologo.profiles?.full_name) || 'Psicólogo'

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
                  <img src={foto} alt={nome} className="w-full h-full object-cover" />
                ) : (
                  nome[0]
                )}
              </div>
              <div>
                <h1 className="text-xl font-serif text-slate-800 flex items-center gap-1.5">
                  {nome}
                </h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="flex items-center gap-1 text-xs bg-teal-700 text-white px-2.5 py-1 rounded-full font-medium">
                    <BadgeCheck className="w-3.5 h-3.5" />
                    Psicólogo verificado
                  </span>
                  <span className="text-sm text-slate-500 font-medium">
                    {formatarCRP(psicologo.crp_region, psicologo.crp_number)}
                  </span>
                </div>
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

            <div className="mt-5 pt-5 border-t border-slate-100 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed">
                <span className="font-medium text-slate-700">Identidade verificada pelo Pandorum.</span>{' '}
                O registro {formatarCRP(psicologo.crp_region, psicologo.crp_number)} foi conferido junto ao Cadastro
                Nacional de Psicólogos do Conselho Federal de Psicologia. Também analisamos documento oficial com foto,
                selfie de conferência e diploma de graduação em Psicologia antes de liberar este perfil.
                {psicologo.approved_at && ` Verificado em ${formatarData(psicologo.approved_at)}.`}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="font-medium text-slate-800 mb-4">Agendar sessão</h2>
            <BookingCalendar psychologistId={psicologo.id} sessionPrice={PRECO_SESSAO_PADRAO} />
          </div>
        </div>

        <aside>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 sticky top-6">
            <div className="text-2xl font-serif text-slate-800 mb-1">
              {formatarPreco(PRECO_SESSAO_PADRAO)}
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
