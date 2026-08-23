'use client'
import { useCallback, useEffect, useState } from 'react'
import { Loader2, ZoomIn, ZoomOut, X, FileText, RotateCw, ExternalLink, AlertCircle } from 'lucide-react'
import { DOCUMENTOS_OBRIGATORIOS, type PsychologistDocument } from '@/lib/types'
import { cn } from '@/lib/utils'

interface DocumentViewerProps {
  documentos: PsychologistDocument[]
}

/**
 * Visualização lado a lado dos documentos, com zoom — é a tela onde o admin
 * compara selfie x documento x diploma antes de aprovar.
 *
 * As URLs são assinadas e expiram em 5 minutos, então são buscadas no momento
 * em que a análise abre e não são guardadas em lugar nenhum.
 */
export default function DocumentViewer({ documentos }: DocumentViewerProps) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [carregando, setCarregando] = useState(documentos.length > 0)
  const [falhas, setFalhas] = useState<string[]>([])
  const [aberto, setAberto] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotacao, setRotacao] = useState(0)

  const buscarUrls = useCallback(async () => {
    const resultado: Record<string, string> = {}
    const erros: string[] = []

    await Promise.all(
      documentos.map(async (doc) => {
        const resposta = await fetch(
          `/api/verificacao/documento-url?path=${encodeURIComponent(doc.storage_path)}`
        )
        if (!resposta.ok) {
          erros.push(doc.doc_type)
          return
        }
        const json = await resposta.json()
        resultado[doc.doc_type] = json.url
      })
    )

    return { resultado, erros }
  }, [documentos])

  useEffect(() => {
    if (documentos.length === 0) return

    // "cancelado" evita gravar estado de uma análise que o admin já fechou:
    // as URLs demoram para voltar e ele pode ter trocado de psicólogo na fila.
    let cancelado = false

    buscarUrls().then(({ resultado, erros }) => {
      if (cancelado) return
      setUrls(resultado)
      setFalhas(erros)
      setCarregando(false)
    })

    return () => { cancelado = true }
  }, [buscarUrls, documentos.length])

  async function tentarNovamente() {
    setCarregando(true)
    const { resultado, erros } = await buscarUrls()
    setUrls(resultado)
    setFalhas(erros)
    setCarregando(false)
  }

  // fechar o zoom com Esc é o reflexo de quem está revisando vários em série
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function abrir(tipo: string) {
    setAberto(tipo)
    setZoom(1)
    setRotacao(0)
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando documentos...
      </div>
    )
  }

  if (documentos.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Nenhum documento enviado.</p>
  }

  const docAberto = documentos.find((d) => d.doc_type === aberto)
  const labelAberto = DOCUMENTOS_OBRIGATORIOS.find((d) => d.tipo === aberto)?.label || ''
  const urlAberta = aberto ? urls[aberto] : null
  const abertoEhPdf = docAberto?.mime_type === 'application/pdf'

  return (
    <>
      {falhas.length > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-xs px-3 py-2 rounded-xl mb-3">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {falhas.length} documento(s) não puderam ser carregados.
          <button onClick={tentarNovamente} className="underline font-medium">Tentar de novo</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {DOCUMENTOS_OBRIGATORIOS.map((esperado) => {
          const doc = documentos.find((d) => d.doc_type === esperado.tipo)
          const url = urls[esperado.tipo]
          const ehPdf = doc?.mime_type === 'application/pdf'

          return (
            <div key={esperado.tipo} className="space-y-1.5">
              <button
                type="button"
                onClick={() => doc && url && abrir(esperado.tipo)}
                disabled={!doc || !url}
                className={cn(
                  'group relative w-full aspect-[4/3] rounded-xl overflow-hidden border bg-slate-50 flex items-center justify-center',
                  doc && url ? 'border-slate-200 hover:border-teal-400 cursor-zoom-in' : 'border-dashed border-slate-200'
                )}
              >
                {!doc ? (
                  <span className="text-xs text-slate-300">Não enviado</span>
                ) : ehPdf ? (
                  <span className="flex flex-col items-center gap-1 text-slate-400">
                    <FileText className="w-6 h-6" />
                    <span className="text-xs">PDF</span>
                  </span>
                ) : url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={esperado.label} className="w-full h-full object-cover" />
                    <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </span>
                  </>
                ) : (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                )}
              </button>
              <p className={cn('text-xs leading-tight', doc ? 'text-slate-600' : 'text-slate-300')}>
                {esperado.label}
              </p>
            </div>
          )
        })}
      </div>

      {aberto && urlAberta && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={() => setAberto(null)}>
          <div
            className="flex items-center justify-between px-4 py-3 text-white flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium">{labelAberto}</p>
            <div className="flex items-center gap-1">
              {!abertoEhPdf && (
                <>
                  <BotaoFerramenta onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} titulo="Diminuir zoom">
                    <ZoomOut className="w-4 h-4" />
                  </BotaoFerramenta>
                  <span className="text-xs w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
                  <BotaoFerramenta onClick={() => setZoom((z) => Math.min(5, z + 0.25))} titulo="Aumentar zoom">
                    <ZoomIn className="w-4 h-4" />
                  </BotaoFerramenta>
                  <BotaoFerramenta onClick={() => setRotacao((r) => (r + 90) % 360)} titulo="Girar">
                    <RotateCw className="w-4 h-4" />
                  </BotaoFerramenta>
                </>
              )}
              <a
                href={urlAberta}
                target="_blank"
                rel="noopener noreferrer"
                title="Abrir em nova aba"
                className="p-2 rounded-lg hover:bg-white/10"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
              <BotaoFerramenta onClick={() => setAberto(null)} titulo="Fechar">
                <X className="w-4 h-4" />
              </BotaoFerramenta>
            </div>
          </div>

          <div className="flex-1 overflow-auto flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            {abertoEhPdf ? (
              <iframe src={urlAberta} title={labelAberto} className="w-full h-full rounded-xl bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={urlAberta}
                alt={labelAberto}
                style={{ transform: `scale(${zoom}) rotate(${rotacao}deg)` }}
                className="max-w-full max-h-full object-contain transition-transform origin-center"
              />
            )}
          </div>

          <p className="text-center text-white/40 text-xs pb-3 flex-shrink-0">
            Clique fora da imagem ou pressione Esc para fechar
          </p>
        </div>
      )}
    </>
  )
}

function BotaoFerramenta({
  onClick, titulo, children,
}: { onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={titulo} className="p-2 rounded-lg hover:bg-white/10">
      {children}
    </button>
  )
}
