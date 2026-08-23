'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  ShieldCheck, Clock, ExternalLink, Check, X, FileWarning, Loader2,
  ChevronRight, Inbox, History, AlertCircle, MailCheck, MailX,
} from 'lucide-react'
import StatusBadge from '@/components/admin/StatusBadge'
import DocumentViewer from '@/components/verificacao/DocumentViewer'
import { createClient } from '@/lib/supabase/client'
import {
  CHECKLIST_VERIFICACAO, urlConsultaCFP,
  type Psychologist, type PsychologistDocument, type VerificationAuditLog,
} from '@/lib/types'
import { capitalizarNome, cn, formatarCPF, formatarCRP, formatarData, formatarDataHora } from '@/lib/utils'

type Acao = 'aprovar' | 'rejeitar' | 'solicitar_documento'

const ROTULO_ACAO: Record<string, string> = {
  approved: 'Aprovou',
  rejected: 'Rejeitou',
  requested_document: 'Solicitou documento',
  suspended: 'Suspendeu',
  reinstated: 'Reativou',
}

export default function AdminVerificacoesPage() {
  const [fila, setFila] = useState<Psychologist[]>([])
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [documentos, setDocumentos] = useState<PsychologistDocument[]>([])
  const [historico, setHistorico] = useState<VerificationAuditLog[]>([])
  const [carregando, setCarregando] = useState(true)
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false)
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [motivo, setMotivo] = useState('')
  const [acaoAberta, setAcaoAberta] = useState<Exclude<Acao, 'aprovar'> | null>(null)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const supabase = createClient()

  async function carregarFila() {
    const { data, error } = await supabase
      .from('psychologists')
      .select('*, profiles!profile_id(*)')
      .in('status', ['pending_review', 'pending_documents', 'pending'])
      .order('documents_submitted_at', { ascending: true, nullsFirst: false })

    if (error) {
      console.error('Erro ao carregar fila de verificação:', error)
      setErro('Não foi possível carregar a fila de verificação.')
      setCarregando(false)
      return
    }

    setFila((data as unknown as Psychologist[]) || [])
    setCarregando(false)
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    carregarFila()
  }, [])

  async function selecionar(psi: Psychologist) {
    setSelecionadoId(psi.id)
    setCarregandoDetalhe(true)
    setChecklist({})
    setMotivo('')
    setAcaoAberta(null)
    setErro('')
    setAviso('')

    const [{ data: docs }, { data: logs }] = await Promise.all([
      supabase.from('psychologist_documents').select('*').eq('psychologist_id', psi.id),
      supabase
        .from('verification_audit_log')
        .select('*')
        .eq('psychologist_id', psi.id)
        .order('created_at', { ascending: false }),
    ])

    setDocumentos((docs as PsychologistDocument[]) || [])
    setHistorico((logs as VerificationAuditLog[]) || [])
    setCarregandoDetalhe(false)
  }

  const selecionado = useMemo(() => fila.find((p) => p.id === selecionadoId) || null, [fila, selecionadoId])
  const checklistCompleto = CHECKLIST_VERIFICACAO.every((item) => checklist[item.chave])
  const aguardandoAnalise = fila.filter((p) => p.status === 'pending_review')

  async function executar(acao: Acao) {
    if (!selecionado) return
    setProcessando(true)
    setErro('')
    setAviso('')

    const resposta = await fetch('/api/admin/verificacoes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        psychologistId: selecionado.id,
        acao,
        checklist: acao === 'aprovar' ? checklist : undefined,
        motivo: acao === 'aprovar' ? undefined : motivo,
      }),
    })

    const json = await resposta.json()
    setProcessando(false)

    if (!resposta.ok) {
      setErro(json.error || 'Não foi possível concluir a ação.')
      return
    }

    if (json.emailEnviado === false) {
      setAviso('Ação registrada, mas o e-mail de notificação não foi enviado (verifique a RESEND_API_KEY).')
    }
    if (json.auditoriaRegistrada === false) {
      setAviso((a) => `${a ? a + ' ' : ''}Atenção: o registro de auditoria falhou — confira os logs do servidor.`)
    }

    setSelecionadoId(null)
    setDocumentos([])
    setHistorico([])
    await carregarFila()
  }

  if (carregando) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </div>
    )
  }

  return (
    <div className="px-6 md:px-10 py-8 md:py-10 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-1">Verificações</h1>
        <p className="text-slate-500 text-sm">
          {aguardandoAnalise.length} aguardando análise · {fila.length - aguardandoAnalise.length} ainda enviando documentos
        </p>
      </div>

      {erro && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {erro}
        </div>
      )}
      {aviso && (
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 text-sm px-4 py-3 rounded-xl mb-4">
          <MailX className="w-4 h-4 flex-shrink-0" />
          {aviso}
        </div>
      )}

      <div className="grid lg:grid-cols-[320px_1fr] gap-5 items-start">
        {/* ---------- fila ---------- */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Inbox className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Fila de análise</span>
          </div>

          {fila.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <ShieldCheck className="w-8 h-8 text-teal-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhum cadastro pendente.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[70vh] overflow-y-auto">
              {fila.map((p) => {
                const nome = capitalizarNome(p.profiles?.full_name) || 'Psicólogo'
                const ativo = selecionadoId === p.id
                const prontoParaAnalise = p.status === 'pending_review'

                return (
                  <button
                    key={p.id}
                    onClick={() => selecionar(p)}
                    className={cn(
                      'w-full text-left px-4 py-3 flex items-center gap-3 transition-colors',
                      ativo ? 'bg-teal-50' : 'hover:bg-slate-50'
                    )}
                  >
                    <span className="w-9 h-9 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-medium overflow-hidden flex-shrink-0">
                      {p.profiles?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.profiles.avatar_url} alt={nome} className="w-full h-full object-cover" />
                      ) : (
                        nome[0]
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{nome}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {formatarCRP(p.crp_region, p.crp_number)}
                        {prontoParaAnalise && p.documents_submitted_at && ` · ${formatarData(p.documents_submitted_at)}`}
                      </p>
                    </div>
                    {prontoParaAnalise ? (
                      <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ---------- detalhe ---------- */}
        {!selecionado ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-20 text-center">
            <ShieldCheck className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">Selecione um cadastro na fila para analisar.</p>
          </div>
        ) : carregandoDetalhe ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-6 py-20 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-300 mx-auto" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* dados do cadastro */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div>
                  <h2 className="text-lg font-medium text-slate-800">
                    {capitalizarNome(selecionado.profiles?.full_name) || 'Psicólogo'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">{selecionado.profiles?.email}</p>
                </div>
                <StatusBadge tipo="psicologo" valor={selecionado.status} />
              </div>

              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <Info label="Nome no documento" valor={selecionado.full_name_document} destaque />
                <Info label="Nome na conta" valor={capitalizarNome(selecionado.profiles?.full_name)} />
                <Info label="CPF" valor={selecionado.cpf ? formatarCPF(selecionado.cpf) : null} />
                <Info
                  label="Data de nascimento"
                  valor={selecionado.birth_date ? formatarData(selecionado.birth_date) : null}
                />
                <Info
                  label="Registro profissional"
                  valor={formatarCRP(selecionado.crp_region, selecionado.crp_number)}
                  destaque
                />
                <Info label="Estado do CRP" valor={selecionado.crp_state} />
                <Info label="Telefone" valor={selecionado.profiles?.phone} />
                <Info
                  label="Documentos enviados em"
                  valor={selecionado.documents_submitted_at ? formatarDataHora(selecionado.documents_submitted_at) : null}
                />
                <Info
                  label="Declarações aceitas em"
                  valor={
                    selecionado.verification_terms_accepted_at
                      ? formatarDataHora(selecionado.verification_terms_accepted_at)
                      : null
                  }
                />
              </div>

              {selecionado.crp_number && (
                <a
                  href={urlConsultaCFP(selecionado.crp_number)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 bg-purple-50 text-purple-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-purple-100 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Conferir CRP {formatarCRP(selecionado.crp_region, selecionado.crp_number).replace('CRP ', '')} no Cadastro Nacional do CFP
                </a>
              )}
            </div>

            {/* documentos */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-medium text-slate-800 mb-1">Documentos enviados</h3>
              <p className="text-xs text-slate-400 mb-4">
                Clique em qualquer documento para ampliar, girar e comparar. Os links expiram em 5 minutos.
              </p>
              <DocumentViewer documentos={documentos} />
            </div>

            {/* checklist e decisão */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h3 className="font-medium text-slate-800 mb-1">Checklist de verificação</h3>
              <p className="text-xs text-slate-400 mb-4">
                Todos os itens precisam ser confirmados para liberar a aprovação. O que você marcar fica registrado na auditoria.
              </p>

              <div className="space-y-2 mb-5">
                {CHECKLIST_VERIFICACAO.map((item) => (
                  <label
                    key={item.chave}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors',
                      checklist[item.chave] ? 'border-teal-200 bg-teal-50/50' : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(checklist[item.chave])}
                      onChange={(e) => setChecklist((atual) => ({ ...atual, [item.chave]: e.target.checked }))}
                      className="mt-0.5 w-4 h-4 accent-teal-700 flex-shrink-0"
                    />
                    <span className="text-sm text-slate-700">{item.label}</span>
                  </label>
                ))}
              </div>

              {acaoAberta && (
                <div className="mb-4">
                  <label className="text-sm font-medium text-slate-700 block mb-1">
                    {acaoAberta === 'rejeitar' ? 'Motivo da rejeição' : 'O que está faltando'}
                  </label>
                  <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    placeholder={
                      acaoAberta === 'rejeitar'
                        ? 'Ex: o número de CRP informado não consta como ativo no Cadastro Nacional do CFP.'
                        : 'Ex: a foto do verso do RG está ilegível. Reenvie com melhor iluminação.'
                    }
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    Esse texto é enviado por e-mail ao psicólogo — escreva pensando em quem vai ler.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {!acaoAberta && (
                  <button
                    onClick={() => executar('aprovar')}
                    disabled={!checklistCompleto || processando}
                    title={checklistCompleto ? undefined : 'Marque todos os itens do checklist para liberar a aprovação'}
                    className="flex items-center gap-2 bg-teal-700 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Aprovar cadastro
                  </button>
                )}

                {acaoAberta === 'rejeitar' ? (
                  <>
                    <button
                      onClick={() => executar('rejeitar')}
                      disabled={processando || motivo.trim().length < 10}
                      className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-700 disabled:opacity-40"
                    >
                      {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      Confirmar rejeição
                    </button>
                    <button
                      onClick={() => { setAcaoAberta(null); setMotivo('') }}
                      className="px-4 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </>
                ) : acaoAberta === 'solicitar_documento' ? (
                  <>
                    <button
                      onClick={() => executar('solicitar_documento')}
                      disabled={processando || motivo.trim().length < 10}
                      className="flex items-center gap-2 bg-amber-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-700 disabled:opacity-40"
                    >
                      {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileWarning className="w-4 h-4" />}
                      Enviar solicitação
                    </button>
                    <button
                      onClick={() => { setAcaoAberta(null); setMotivo('') }}
                      className="px-4 py-2.5 rounded-xl text-sm text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setAcaoAberta('rejeitar'); setMotivo('') }}
                      className="flex items-center gap-2 border border-red-200 text-red-600 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                      Rejeitar
                    </button>
                    <button
                      onClick={() => { setAcaoAberta('solicitar_documento'); setMotivo('') }}
                      className="flex items-center gap-2 border border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50"
                    >
                      <FileWarning className="w-4 h-4" />
                      Solicitar novo documento
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* auditoria */}
            {historico.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <h3 className="flex items-center gap-2 font-medium text-slate-800 mb-4">
                  <History className="w-4 h-4 text-slate-400" />
                  Histórico de auditoria
                </h3>
                <div className="space-y-3">
                  {historico.map((log) => (
                    <div key={log.id} className="flex gap-3 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-2 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-slate-700">
                          <span className="font-medium">{ROTULO_ACAO[log.action] || log.action}</span>
                          {log.admin_name ? ` · ${capitalizarNome(log.admin_name)}` : ''}
                        </p>
                        <p className="text-xs text-slate-400">{formatarDataHora(log.created_at)}</p>
                        {log.reason && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{log.reason}</p>}
                        {log.checklist && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {CHECKLIST_VERIFICACAO.filter((i) => log.checklist?.[i.chave]).map((i) => (
                              <span
                                key={i.chave}
                                className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 text-[11px] px-2 py-0.5 rounded-full"
                              >
                                <MailCheck className="w-3 h-3" />
                                {i.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Info({ label, valor, destaque }: { label: string; valor: string | null | undefined; destaque?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={cn('text-slate-700', destaque && 'font-medium')}>{valor || '—'}</p>
    </div>
  )
}
