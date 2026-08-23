'use client'
import { useRef, useState } from 'react'
import { Upload, Check, Loader2, Eye, X, FileText, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatarTamanhoArquivo, cn } from '@/lib/utils'
import type { DocumentType, PsychologistDocument } from '@/lib/types'

const TAMANHO_MAXIMO = 8 * 1024 * 1024
const TIPOS_ACEITOS = 'image/png,image/jpeg,image/webp,application/pdf'

interface DocumentUploadProps {
  userId: string
  psychologistId: string
  tipo: DocumentType
  label: string
  descricao: string
  documento: PsychologistDocument | null
  bloqueado?: boolean
  onEnviado: (doc: PsychologistDocument) => void
}

export default function DocumentUpload({
  userId,
  psychologistId,
  tipo,
  label,
  descricao,
  documento,
  bloqueado = false,
  onEnviado,
}: DocumentUploadProps) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [carregandoPreview, setCarregandoPreview] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return

    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro('O arquivo deve ter no máximo 8MB.')
      return
    }
    if (!TIPOS_ACEITOS.split(',').includes(arquivo.type)) {
      setErro('Envie uma imagem (JPG, PNG ou WEBP) ou um PDF.')
      return
    }

    setErro('')
    setEnviando(true)

    const extensao = arquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    // a policy do bucket exige que a primeira pasta seja o id do usuário
    const caminho = `${userId}/${tipo}.${extensao}`

    const { error: erroUpload } = await supabase.storage
      .from('verification-documents')
      .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type })

    if (erroUpload) {
      console.error('Erro ao subir documento de verificação:', tipo, erroUpload)
      setErro('Não foi possível enviar o arquivo. Tente novamente.')
      setEnviando(false)
      return
    }

    const { data, error: erroRegistro } = await supabase
      .from('psychologist_documents')
      .upsert(
        {
          psychologist_id: psychologistId,
          doc_type: tipo,
          storage_path: caminho,
          mime_type: arquivo.type,
          file_size: arquivo.size,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'psychologist_id,doc_type' }
      )
      .select()
      .single()

    if (erroRegistro) {
      console.error('Erro ao registrar documento de verificação:', tipo, erroRegistro)
      setErro('O arquivo subiu, mas não foi possível registrá-lo. Tente enviar de novo.')
      setEnviando(false)
      return
    }

    onEnviado(data as PsychologistDocument)
    setEnviando(false)
  }

  async function verDocumento() {
    if (!documento) return
    setCarregandoPreview(true)
    setErro('')

    const resposta = await fetch(`/api/verificacao/documento-url?path=${encodeURIComponent(documento.storage_path)}`)
    const json = await resposta.json()

    if (!resposta.ok) {
      setErro(json.error || 'Não foi possível abrir o documento.')
      setCarregandoPreview(false)
      return
    }

    setPreviewUrl(json.url)
    setCarregandoPreview(false)
  }

  const enviado = Boolean(documento)
  const ehPdf = documento?.mime_type === 'application/pdf'

  return (
    <>
      <div
        className={cn(
          'border rounded-2xl p-4 transition-colors',
          enviado ? 'border-teal-200 bg-teal-50/40' : 'border-slate-200 bg-white'
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
              enviado ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'
            )}
          >
            {enviado ? <Check className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800">{label}</p>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{descricao}</p>

            {enviado && (
              <p className="text-xs text-teal-700 mt-1.5">
                Enviado{documento?.file_size ? ` · ${formatarTamanhoArquivo(documento.file_size)}` : ''}
              </p>
            )}

            {erro && (
              <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {erro}
              </p>
            )}

            <div className="flex items-center gap-2 mt-3">
              {!bloqueado && (
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  disabled={enviando}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50',
                    enviado
                      ? 'border border-slate-200 text-slate-600 hover:border-teal-300 bg-white'
                      : 'bg-teal-700 text-white hover:bg-teal-800'
                  )}
                >
                  {enviando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  {enviando ? 'Enviando...' : enviado ? 'Trocar arquivo' : 'Enviar arquivo'}
                </button>
              )}

              {enviado && (
                <button
                  type="button"
                  onClick={verDocumento}
                  disabled={carregandoPreview}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  {carregandoPreview ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
                  Ver
                </button>
              )}
            </div>
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={TIPOS_ACEITOS}
          onChange={handleArquivo}
          className="hidden"
        />
      </div>

      {previewUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl(null)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewUrl(null)}
              className="absolute -top-10 right-0 text-white/80 hover:text-white flex items-center gap-1 text-sm"
            >
              <X className="w-4 h-4" /> Fechar
            </button>
            {ehPdf ? (
              <iframe src={previewUrl} title={label} className="w-full h-[80vh] rounded-xl bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt={label} className="w-full max-h-[85vh] object-contain rounded-xl bg-white" />
            )}
          </div>
        </div>
      )}
    </>
  )
}
