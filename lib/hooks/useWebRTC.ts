'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; from: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; from: string }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit; from: string }

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
]

/**
 * Chamada de vídeo P2P (WebRTC) usando um canal Realtime do Supabase como sinalizador.
 * Não depende de nenhum serviço externo pago — apenas STUN público do Google.
 * Sem servidor TURN: em redes com NAT muito restritivo a conexão pode falhar.
 */
export function useWebRTC(salaId: string, meuId: string, souIniciador: boolean) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [status, setStatus] = useState<'aguardando' | 'conectando' | 'conectado' | 'erro'>('aguardando')
  const [micAtivo, setMicAtivo] = useState(true)
  const [cameraAtiva, setCameraAtiva] = useState(true)

  const pcRef = useRef<RTCPeerConnection | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const supabase = createClient()

  const encerrar = useCallback(() => {
    pcRef.current?.close()
    pcRef.current = null
    localStream?.getTracks().forEach((t) => t.stop())
    if (channelRef.current) supabase.removeChannel(channelRef.current)
  }, [localStream])

  useEffect(() => {
    let cancelado = false

    async function iniciar() {
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      } catch {
        setStatus('erro')
        return
      }
      if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return }
      setLocalStream(stream)

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      stream.getTracks().forEach((track) => pc.addTrack(track, stream))

      pc.ontrack = (event) => {
        setRemoteStream(event.streams[0])
        setStatus('conectado')
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connecting') setStatus('conectando')
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus('erro')
      }

      const channel = supabase.channel(`sala-${salaId}`, {
        config: { broadcast: { self: false } },
      })
      channelRef.current = channel

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'ice-candidate', candidate: event.candidate.toJSON(), from: meuId },
          })
        }
      }

      channel.on('broadcast', { event: 'signal' }, async ({ payload }: { payload: SignalPayload }) => {
        if (payload.from === meuId) return

        if (payload.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { type: 'answer', sdp: answer, from: meuId },
          })
        } else if (payload.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
        } else if (payload.type === 'ice-candidate') {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(payload.candidate))
          } catch {
            // candidato pode chegar antes da remote description; ignorar falhas pontuais
          }
        }
      })

      channel.on('presence', { event: 'sync' }, () => {
        const presentes = Object.keys(channel.presenceState())
        if (souIniciador && presentes.length > 1 && pc.signalingState === 'stable' && !pc.currentLocalDescription) {
          criarOferta()
        }
      })

      async function criarOferta() {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { type: 'offer', sdp: offer, from: meuId },
        })
      }

      await channel.subscribe(async (subStatus) => {
        if (subStatus === 'SUBSCRIBED') {
          await channel.track({ id: meuId, online_at: new Date().toISOString() })
        }
      })
    }

    iniciar()

    return () => {
      cancelado = true
      encerrar()
    }
  }, [salaId])

  function alternarMicrofone() {
    localStream?.getAudioTracks().forEach((t) => { t.enabled = !t.enabled })
    setMicAtivo((v) => !v)
  }

  function alternarCamera() {
    localStream?.getVideoTracks().forEach((t) => { t.enabled = !t.enabled })
    setCameraAtiva((v) => !v)
  }

  return { localStream, remoteStream, status, micAtivo, cameraAtiva, alternarMicrofone, alternarCamera, encerrar }
}
