import Link from 'next/link'
import Header from '@/components/Header'
import { Search, CalendarCheck, Video } from 'lucide-react'

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header />

      {/* HERO */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24">
        <span className="text-xs font-medium text-teal-600 bg-teal-50 px-4 py-1.5 rounded-full mb-6">
          Plataforma de psicologia online
        </span>
        <h2 className="text-5xl font-serif text-slate-800 max-w-2xl leading-tight mb-6">
          Cuide da sua saúde mental com quem entende
        </h2>
        <p className="text-lg text-slate-500 max-w-xl mb-10">
          Conectamos você aos melhores psicólogos do Brasil. Sessões online, seguras e acessíveis.
        </p>
        <div className="flex gap-4">
          <Link href="/auth/register" className="px-8 py-3 text-white bg-teal-700 rounded-full font-medium hover:bg-teal-800">
            Começar agora
          </Link>
          <Link href="/psicologos" className="px-8 py-3 text-teal-700 border border-teal-200 rounded-full font-medium hover:bg-teal-50">
            Ver psicólogos
          </Link>
        </div>
      </section>

      {/* STATS */}
      <section className="flex justify-center gap-16 py-12 bg-white border-y border-slate-100">
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
      <section className="px-8 py-20 max-w-4xl mx-auto">
        <h3 className="text-3xl font-serif text-slate-800 text-center mb-12">Como funciona</h3>
        <div className="grid grid-cols-3 gap-8">
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

      {/* FOOTER */}
      <footer className="text-center py-8 text-sm text-slate-400 border-t border-slate-100">
        © {new Date().getFullYear()} Pandorum — Todos os direitos reservados
      </footer>
    </main>
  )
}