import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

interface AuthShellProps {
  /** Frase curta abaixo do logo, específica de cada tela. */
  subtitulo: string
  children: React.ReactNode
}

/**
 * Moldura das telas de autenticação.
 *
 * Essas páginas não usam o Header comum (elas são um card centrado, sem barra
 * de topo), e por isso ficavam sem nenhuma saída: quem chegava em /auth/login
 * direto por um link só conseguia voltar pelo botão do navegador. Aqui ficam as
 * duas rotas de fuga — o link discreto acima do card e o próprio logo — em um
 * lugar só, para as quatro telas não divergirem de novo.
 */
export default function AuthShell({ subtitulo, children }: AuthShellProps) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-teal-700 mb-4 rounded focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Voltar ao início
        </Link>

        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-100">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-serif text-slate-800">
              {/* Mesmas afordâncias do logo do Header (ver components/LogoInicio),
                  escritas aqui em vez de reusar o componente porque ele traz um
                  <div> para posicionar o tooltip, e <div> dentro de <h1> é HTML
                  inválido. Sem tooltip também: o link "Voltar ao início" está
                  logo acima e diria a mesma coisa. */}
              <Link
                href="/"
                aria-label="Pandorum — ir para a página inicial"
                className="
                  inline-block rounded-xl px-2.5 py-1 cursor-pointer
                  transition-all duration-150
                  hover:bg-slate-100 hover:-translate-y-px hover:shadow-sm
                  active:translate-y-0 active:shadow-none
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-teal-600
                "
              >
                Pan<span className="text-teal-600">dorum</span>
              </Link>
            </h1>
            <p className="text-sm text-slate-500 mt-1">{subtitulo}</p>
          </div>

          {children}
        </div>
      </div>
    </main>
  )
}
