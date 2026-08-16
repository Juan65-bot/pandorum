'use client'
import { useRef, useState } from 'react'
import { Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AvatarUploadProps {
  userId: string
  url: string | null
  onUploaded: (url: string) => void
}

export default function AvatarUpload({ userId, url, onUploaded }: AvatarUploadProps) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 3 * 1024 * 1024) {
      setErro('A imagem deve ter no máximo 3MB')
      return
    }

    setErro('')
    setEnviando(true)

    const extensao = file.name.split('.').pop()
    const caminho = `${userId}/avatar.${extensao}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(caminho, file, { upsert: true })

    if (uploadError) {
      setErro('Não foi possível enviar a imagem')
      setEnviando(false)
      return
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(caminho)
    onUploaded(`${data.publicUrl}?t=${Date.now()}`)
    setEnviando(false)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24 rounded-full bg-teal-100 flex items-center justify-center overflow-hidden">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Foto de perfil" className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl text-teal-700 font-medium">P</span>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={enviando}
          className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          {enviando ? (
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          ) : (
            <Camera className="w-5 h-5 text-white" />
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-xs text-teal-700 hover:underline"
      >
        {url ? 'Trocar foto' : 'Adicionar foto'}
      </button>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  )
}
