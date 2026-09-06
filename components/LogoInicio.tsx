'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const ATRASO_TOOLTIP_MS = 350

/**
 * O logo do cabeçalho como link para a home.
 *
 * Ele sempre foi clicável, mas nada dizia isso: sem cursor, sem hover, sem
 * rótulo — parecia só o nome do produto. As afordâncias aqui existem para
 * corrigir isso em cada forma de navegar:
 *
 *   • mouse   — cursor, fundo suave e leve elevação, mais o tooltip
 *   • teclado — anel de foco em :focus-visible e tooltip imediato ao focar
 *   • leitor  — aria-label dizendo para onde o link leva, já que "Pandorum"
 *               sozinho não informa destino
 *
 * O atraso de 350ms no hover é o que separa "parei aqui para ler" de "só
 * passei o mouse a caminho de outra coisa". No foco por teclado não há atraso:
 * quem chegou ali com Tab escolheu chegar.
 */
export default function LogoInicio() {
  const [visivel, setVisivel] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cancelar() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }

  function agendarTooltip() {
    cancelar()
    timer.current = setTimeout(() => setVisivel(true), ATRASO_TOOLTIP_MS)
  }

  function esconder() {
    cancelar()
    setVisivel(false)
  }

  // um timer pendente que dispare depois da desmontagem chamaria setState em
  // componente morto — e o tooltip reapareceria ao remontar
  useEffect(() => cancelar, [])

  return (
    <div className="relative">
      <Link
        href="/"
        aria-label="Pandorum — ir para a página inicial"
        onMouseEnter={agendarTooltip}
        onMouseLeave={esconder}
        onFocus={() => setVisivel(true)}
        onBlur={esconder}
        className="
          inline-flex items-center rounded-xl px-2.5 py-1.5 -mx-2.5 -my-1.5
          text-xl font-serif text-slate-800 cursor-pointer
          transition-all duration-150
          hover:bg-slate-100 hover:-translate-y-px hover:shadow-sm
          active:translate-y-0 active:shadow-none
          focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
          focus-visible:outline-teal-600
        "
      >
        Pan<span className="text-teal-600">dorum</span>
      </Link>

      {/* aria-hidden: o aria-label do link já diz o destino, e anunciar de novo
          faria o leitor de tela repetir a mesma informação duas vezes */}
      <span
        aria-hidden="true"
        className={`
          pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2
          whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1 text-xs text-white shadow-md
          transition-opacity duration-150
          ${visivel ? 'opacity-100' : 'opacity-0'}
        `}
      >
        Página inicial
      </span>
    </div>
  )
}
