import Link from 'next/link'
import Header from '@/components/Header'
import FAQAccordion from '@/components/FAQAccordion'
import { Search, CalendarCheck, Video, Star, Quote } from 'lucide-react'

const DEPOIMENTOS = [
  {
    nome: 'Marina S.',
    papel: 'Paciente há 8 meses',
    texto: 'Encontrei minha psicóloga em menos de 10 minutos e já tive a primeira sessão na mesma semana. Muito mais fácil do que eu imaginava.',
  },
  {
    nome: 'Rafael C.',
    papel: 'Paciente há 1 ano',
    texto: 'O que mais me deixou seguro foi saber que todo psicólogo é verificado pelo CRP antes de aparecer na busca. Uso pelo celular sem nenhum problema.',
  },
  {
    nome: 'Beatriz A.',
    papel: 'Paciente há 3 meses',
    texto: 'Poder remarcar e cancelar direto pelo app, sem precisar mandar mensagem, facilitou muito minha rotina. Recomendo demais.',
  },
] as const

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <section className="flex flex-col items-center justify-center text-center px-5 sm:px-6 py-16 sm:py-24">
        <span className="text-xs font-medium text-teal-600 bg-teal-50 px-4 py-1.5 rounded-full mb-6">
          Plataforma de psicologia online
        </span>
        <h1 className="text-3xl sm:text-5xl font-serif text-slate-800 max-w-2xl leading-tight mb-6">
          Cuide da sua saúde mental com quem entende
        </h1>
        <p className="text-base sm:text-lg text-slate-500 max-w-xl mb-8 sm:mb-10">
          Conectamos você aos melhores psicólogos do Brasil. Sessões online, seguras e acessíveis.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto max-w-xs sm:max-w-none">
          <Link href="/auth/register" className="px-8 py-3 text-white bg-teal-700 rounded-full font-medium hover:bg-teal-800 text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
            Começar agora
          </Link>
          <Link href="/psicologos" className="px-8 py-3 text-teal-700 border border-teal-200 rounded-full font-medium hover:bg-teal-50 text-center focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2">
            Ver psicólogos
          </Link>
        </div>
      </section>

      {/* STATS */}
      <section className="grid grid-cols-2 sm:flex sm:justify-center gap-8 sm:gap-16 px-5 py-10 sm:py-12 bg-white border-y border-slate-100">
        <div className="text-center">
          <div className="text-3xl font-serif text-slate-800">500+</div>
          <div className="text-sm text-slate-500 mt-1">Psicólogos cadastrados</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-serif text-slate-800">10.000+</div>
          <div className="text-sm text-slate-500 mt-1">Pacientes atendidos</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-serif text-slate-800">4.9★</div>
          <div className="text-sm text-slate-500 mt-1">Avaliação média</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-serif text-slate-800">100%</div>
          <div className="text-sm text-slate-500 mt-1">Seguro e privado</div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section className="px-5 sm:px-8 py-14 sm:py-20 max-w-4xl mx-auto">
        <h3 className="text-3xl font-serif text-slate-800 text-center mb-12">Como funciona</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
          <div className="text-center">
            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-teal-600">
              <Search className="w-5 h-5" />
            </div>
            <h4 className="font-medium text-slate-800 mb-2">Encontre seu psicólogo</h4>
            <p className="text-sm text-slate-500">Filtre por especialidade, preço e disponibilidade</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-teal-600">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <h4 className="font-medium text-slate-800 mb-2">Agende sua sessão</h4>
            <p className="text-sm text-slate-500">Escolha o horário ideal e pague com PIX ou cartão</p>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 bg-teal-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-teal-600">
              <Video className="w-5 h-5" />
            </div>
            <h4 className="font-medium text-slate-800 mb-2">Faça sua sessão online</h4>
            <p className="text-sm text-slate-500">Videochamada segura e criptografada na plataforma</p>
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="px-5 sm:px-8 py-14 sm:py-20 bg-white border-y border-slate-100">
        <h3 className="text-3xl font-serif text-slate-800 text-center mb-2">O que dizem nossos pacientes</h3>
        <p className="text-center text-slate-500 text-sm mb-12">Histórias reais de quem já cuida da saúde mental pelo Pandorum</p>
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6">
          {DEPOIMENTOS.map((d) => (
            <div key={d.nome} className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
              <Quote className="w-5 h-5 text-teal-300 mb-3" />
              <p className="text-sm text-slate-600 leading-relaxed mb-4">&ldquo;{d.texto}&rdquo;</p>
              <div className="flex items-center gap-1 text-amber-400 mb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400" />
                ))}
              </div>
              <p className="text-sm font-medium text-slate-800">{d.nome}</p>
              <p className="text-xs text-slate-400">{d.papel}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="px-5 sm:px-8 py-14 sm:py-20 max-w-4xl mx-auto">
        <h3 className="text-3xl font-serif text-slate-800 text-center mb-12">Perguntas frequentes</h3>
        <FAQAccordion />
      </section>

      {/* FOOTER */}
      <footer className="text-center py-8 text-sm text-slate-400 border-t border-slate-100">
        © {new Date().getFullYear()} Pandorum — Todos os direitos reservados
      </footer>
    </main>
  )
}