'use client'
import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2 } from 'lucide-react'
import { useWebRTC } from '@/lib/hooks/useWebRTC'

export default function VideoRoom({
  salaId,
  meuId,
  souIniciador,
  outraPessoa,
}: {
  salaId: string
  meuId: string
  souIniciador: boolean
  outraPessoa: string
}) {
  const router = useRouter()
  const { localStream, remoteStream, status, micAtivo, cameraAtiva, alternarMicrofone, alternarCamera, encerrar } =
    useWebRTC(salaId, meuId, souIniciador)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
  }, [remoteStream])

  function sair() {
    encerrar()
    router.push('/sessoes')
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      <div className="flex-1 relative">
        {remoteStream ? (
          <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 gap-3">
            {status === 'erro' ? (
              <p className="text-sm">Não foi possível acessar câmera/microfone ou conectar. Verifique as permissões e sua conexão.</p>
            ) : (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-sm">Aguardando {outraPessoa || 'a outra pessoa'} entrar na sala...</p>
              </>
            )}
          </div>
        )}

        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-6 right-6 w-40 h-28 object-cover rounded-xl border-2 border-slate-700 bg-slate-800"
        />
      </div>

      <div className="flex items-center justify-center gap-4 py-6 bg-slate-900">
        <button
          onClick={alternarMicrofone}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${micAtivo ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`}
        >
          {micAtivo ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
        </button>
        <button
          onClick={alternarCamera}
          className={`w-12 h-12 rounded-full flex items-center justify-center ${cameraAtiva ? 'bg-slate-700 text-white' : 'bg-red-600 text-white'}`}
        >
          {cameraAtiva ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
        </button>
        <button
          onClick={sair}
          className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 text-white hover:bg-red-700"
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
