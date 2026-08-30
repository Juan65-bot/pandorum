'use client'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BadgeCheck, Clock, XCircle, ShieldAlert, FileWarning, Check,
  ArrowRight, ArrowLeft, Loader2, ShieldCheck, IdCard, FileText, Scale,
} from 'lucide-react'
import Header from '@/components/Header'
import DocumentUpload from '@/components/verificacao/DocumentUpload'
import { createClient } from '@/lib/supabase/client'
import { ensureProfile } from '@/lib/ensureProfile'
import { verificacaoIdentidadeSchema, type VerificacaoIdentidadeInput } from '@/lib/validation'
import {
  DOCUMENTOS_OBRIGATORIOS, UFS, PRECO_SESSAO_PADRAO, REPASSE_PSICOLOGO_SESSAO,
  type Psychologist, type PsychologistDocument, type PsychologistStatus,
} from '@/lib/types'
import { cn, formatarCPF, formatarCRP, formatarData } from '@/lib/utils'

const VERSAO_TERMOS_VERIFICACAO = '1.0'

const ETAPAS = [
  { numero: 1, label: 'Identidade', icone: IdCard },
  { numero: 2, label: 'Documentos', icone: FileText },
  { numero: 3, label: 'Declarações', icone: Scale },
] as const

const DECLARACOES = [
  {
    chave: 'veracidade' as const,
    titulo: 'Declaração de veracidade',
    texto:
      'Declaro que todas as informações e documentos enviados são verdadeiros, atuais e de minha titularidade, e que o registro no Conselho Regional de Psicologia informado está ativo e em meu nome.',
  },
  {
    chave: 'responsabilidade' as const,
    titulo: 'Ciência da responsabilidade por fraude',
    texto:
      'Estou ciente de que prestar informação falsa ou apresentar documento falsificado configura ilícito civil e criminal, sujeito às penas dos artigos 297 a 299 do Código Penal, além de responsabilização perante o Conselho Federal de Psicologia e do encerramento imediato da conta.',
  },
  {
    chave: 'contrato' as const,
    titulo: 'Contrato do psicólogo',
    texto:
      `Li e aceito o contrato de parceria profissional do Pandorum, incluindo o repasse fixo de R$ ${REPASSE_PSICOLOGO_SESSAO},00 por sessão paga (de R$ ${PRECO_SESSAO_PADRAO},00 cobrados do paciente) e as obrigações éticas previstas nas resoluções do CFP.`,
  },
  {
    chave: 'privacidade' as const,
    titulo: 'Política de privacidade e LGPD',
    texto:
      'Autorizo o Pandorum a tratar meus dados pessoais e documentos exclusivamente para fins de verificação de identidade e registro profissional, nos termos da Lei nº 13.709/2018 (LGPD), e reconheço que os documentos enviados ficam armazenados de forma privada, acessíveis apenas por mim e pela equipe de verificação.',
  },
]

export default function VerificacaoPsicologoPage() {
  const [carregando, setCarregando] = useState(true)
  const [userId, setUserId] = useState('')
  const [emailConta, setEmailConta] = useState('')
  const [psicologo, setPsicologo] = useState<Psychologist | null>(null)
  const [documentos, setDocumentos] = useState<PsychologistDocument[]>([])
  const [etapa, setEtapa] = useState(1)
  const [aceites, setAceites] = useState<Record<string, boolean>>({})
  const [salvandoTermos, setSalvandoTermos] = useState(false)
  const [enviandoAnalise, setEnviandoAnalise] = useState(false)
  const [erro, setErro] = useState('')
  const [sucessoEtapa1, setSucessoEtapa1] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VerificacaoIdentidadeInput>({
    resolver: zodResolver(verificacaoIdentidadeSchema),
  })

  const cpfDigitado = watch('cpf') || ''

  useEffect(() => {
    async function carregar() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }
      setUserId(user.id)

      const perfil = await ensureProfile(supabase, user)
      if (perfil?.role !== 'psychologist') { router.push('/dashboard'); return }
      setEmailConta(perfil.email || user.email || '')

      const { data: psi } = await supabase
        .from('psychologists')
        .select('*')
        .eq('profile_id', user.id)
        .maybeSingle()

      if (psi) {
        const registro = psi as Psychologist
        setPsicologo(registro)
        setAceites(
          registro.verification_terms_accepted_at
            ? Object.fromEntries(DECLARACOES.map((d) => [d.chave, true]))
            : {}
        )
        reset({
          full_name_document: registro.full_name_document || perfil.full_name || '',
          cpf: registro.cpf ? formatarCPF(registro.cpf) : '',
          crp_region: registro.crp_region || '',
          crp_number: (registro.crp_number || '').replace(/\D/g, ''),
          crp_state: (registro.crp_state as VerificacaoIdentidadeInput['crp_state']) || undefined,
          birth_date: registro.birth_date || '',
          phone: perfil.phone || '',
          postal_code: registro.postal_code || '',
          address_street: registro.address_street || '',
          address_number: registro.address_number || '',
          address_complement: registro.address_complement || '',
          address_district: registro.address_district || '',
          address_city: registro.address_city || '',
          address_state: (registro.address_state as VerificacaoIdentidadeInput['address_state']) || undefined,
          income_value: registro.income_value != null ? String(registro.income_value) : '',
        })

        const { data: docs } = await supabase
          .from('psychologist_documents')
          .select('*')
          .eq('psychologist_id', registro.id)
        setDocumentos((docs as PsychologistDocument[]) || [])
      } else {
        reset({
          full_name_document: perfil.full_name || '',
          cpf: '',
          crp_region: '',
          crp_number: '',
          birth_date: '',
          phone: perfil.phone || '',
          postal_code: '',
          address_street: '',
          address_number: '',
          address_complement: '',
          address_district: '',
          address_city: '',
          income_value: '',
        })
      }

      setCarregando(false)
    }
    carregar()
  }, [])

  const status: PsychologistStatus | null = psicologo?.status ?? null
  const documentosEnviados = new Set(documentos.map((d) => d.doc_type))
  const todosDocumentosEnviados = DOCUMENTOS_OBRIGATORIOS.every((d) => documentosEnviados.has(d.tipo))
  const todasDeclaracoesAceitas = DECLARACOES.every((d) => aceites[d.chave])
  const emEdicao = status === null || status === 'pending_documents' || status === 'pending' || status === 'rejected'

  async function salvarIdentidade(dados: VerificacaoIdentidadeInput) {
    setErro('')
    setSucessoEtapa1(false)

    const payload = {
      profile_id: userId,
      full_name_document: dados.full_name_document.trim(),
      cpf: dados.cpf.replace(/\D/g, ''),
      crp_region: dados.crp_region,
      crp_number: dados.crp_number,
      crp_state: dados.crp_state,
      birth_date: dados.birth_date,
      postal_code: dados.postal_code.replace(/\D/g, ''),
      address_street: dados.address_street.trim(),
      address_number: dados.address_number.trim(),
      address_complement: dados.address_complement?.trim() || null,
      address_district: dados.address_district.trim(),
      address_city: dados.address_city.trim(),
      address_state: dados.address_state,
      // o schema guarda string para não quebrar o resolver do react-hook-form;
      // a conversão para número acontece aqui, aceitando "3.500,00" e "3500"
      income_value: Number(dados.income_value.replace(/\./g, '').replace(',', '.')),
      // session_price é NOT NULL na tabela; a 0013 cria um default, mas mandar o
      // valor explícito evita depender da ordem em que as migrations foram aplicadas.
      session_price: PRECO_SESSAO_PADRAO,
    }

    await supabase.from('profiles').update({ phone: dados.phone }).eq('id', userId)

    if (psicologo) {
      const { error } = await supabase.from('psychologists').update(payload).eq('id', psicologo.id)
      if (error) { setErro(traduzirErro(error)); return }
      setPsicologo({ ...psicologo, ...payload } as Psychologist)
    } else {
      const { data, error } = await supabase.from('psychologists').insert(payload).select().single()
      if (error) { setErro(traduzirErro(error)); return }
      setPsicologo(data as Psychologist)
    }

    setSucessoEtapa1(true)
    setEtapa(2)
  }

  async function salvarDeclaracoes() {
    if (!psicologo || !todasDeclaracoesAceitas) return
    setSalvandoTermos(true)
    setErro('')

    const { error } = await supabase
      .from('psychologists')
      .update({
        verification_terms_accepted_at: new Date().toISOString(),
        verification_terms_version: VERSAO_TERMOS_VERIFICACAO,
      })
      .eq('id', psicologo.id)

    setSalvandoTermos(false)
    if (error) { setErro('Não foi possível registrar suas declarações. Tente novamente.'); return }

    setPsicologo({
      ...psicologo,
      verification_terms_accepted_at: new Date().toISOString(),
      verification_terms_version: VERSAO_TERMOS_VERIFICACAO,
    })
  }

  async function enviarParaAnalise() {
    setEnviandoAnalise(true)
    setErro('')

    if (!psicologo?.verification_terms_accepted_at) {
      await salvarDeclaracoes()
    }

    const resposta = await fetch('/api/verificacao/enviar-para-analise', { method: 'POST' })
    const json = await resposta.json()
    setEnviandoAnalise(false)

    if (!resposta.ok) { setErro(json.error || 'Não foi possível enviar para análise.'); return }

    setPsicologo((atual) => (atual ? { ...atual, status: 'pending_review' } : atual))
  }

  if (carregando) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-400 text-sm">Carregando...</p>
      </main>
    )
  }

  // ---------- estados terminais ----------
  if (status === 'approved') {
    return (
      <Moldura>
        <PainelStatus
          icone={<BadgeCheck className="w-6 h-6" />}
          cor="teal"
          titulo="Cadastro verificado"
          texto="Seu registro no CRP foi conferido junto ao Conselho Federal de Psicologia. Seu perfil aparece na busca pública com o selo de psicólogo verificado e você já pode receber agendamentos."
        />
        <ResumoIdentidade psicologo={psicologo!} />
        <Link
          href="/psicologo/completar-perfil"
          className="block text-center bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800"
        >
          Ir para meu perfil profissional
        </Link>
      </Moldura>
    )
  }

  if (status === 'pending_review') {
    return (
      <Moldura>
        <PainelStatus
          icone={<Clock className="w-6 h-6" />}
          cor="amber"
          titulo="Documentos em análise"
          texto={`Recebemos seus ${DOCUMENTOS_OBRIGATORIOS.length} documentos${
            psicologo?.documents_submitted_at ? ` em ${formatarData(psicologo.documents_submitted_at)}` : ''
          }. Nossa equipe está conferindo seu registro no Cadastro Nacional de Psicólogos do CFP. O prazo de análise é de até 48 horas úteis e você recebe um e-mail assim que houver uma decisão.`}
        />
        <ResumoIdentidade psicologo={psicologo!} />
        <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Documentos enviados</p>
          {DOCUMENTOS_OBRIGATORIOS.map((d) => (
            <div key={d.tipo} className="flex items-center gap-2 text-sm text-slate-600">
              <Check className="w-4 h-4 text-teal-600 flex-shrink-0" />
              {d.label}
            </div>
          ))}
        </div>
      </Moldura>
    )
  }

  if (status === 'suspended') {
    return (
      <Moldura>
        <PainelStatus
          icone={<ShieldAlert className="w-6 h-6" />}
          cor="red"
          titulo="Conta suspensa"
          texto={
            psicologo?.rejection_reason ||
            'Sua conta foi suspensa pela equipe Pandorum. Entre em contato com o suporte para mais informações.'
          }
        />
      </Moldura>
    )
  }

  // ---------- wizard ----------
  return (
    <Moldura>
      <div>
        <h1 className="text-2xl md:text-3xl font-serif text-slate-800 mb-2">Verificação profissional</h1>
        <p className="text-slate-500 text-sm leading-relaxed">
          Todo psicólogo do Pandorum tem o CRP conferido junto ao Conselho Federal de Psicologia antes de atender.
          É o que garante ao paciente que do outro lado há um profissional real e registrado.
        </p>
      </div>

      {status === 'rejected' && psicologo?.rejection_reason && (
        <PainelStatus
          icone={<XCircle className="w-6 h-6" />}
          cor="red"
          titulo="Cadastro não aprovado"
          texto={psicologo.rejection_reason}
          rodape="Corrija o que for necessário abaixo e envie novamente para análise."
        />
      )}

      {psicologo?.additional_document_request && (
        <PainelStatus
          icone={<FileWarning className="w-6 h-6" />}
          cor="amber"
          titulo="Documento adicional necessário"
          texto={psicologo.additional_document_request}
          rodape="Depois de enviar, seu cadastro volta para a fila de análise."
        />
      )}

      {/* stepper */}
      <div className="flex items-center">
        {ETAPAS.map((e, indice) => {
          const Icone = e.icone
          const concluida =
            (e.numero === 1 && Boolean(psicologo?.cpf)) ||
            (e.numero === 2 && todosDocumentosEnviados) ||
            (e.numero === 3 && todasDeclaracoesAceitas)
          const ativa = etapa === e.numero
          const acessivel = e.numero === 1 || Boolean(psicologo?.id)

          return (
            <div key={e.numero} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                onClick={() => acessivel && setEtapa(e.numero)}
                disabled={!acessivel}
                className={cn(
                  'flex items-center gap-2 disabled:cursor-not-allowed',
                  !acessivel && 'opacity-40'
                )}
              >
                <span
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors',
                    ativa ? 'bg-teal-700 text-white' : concluida ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-400'
                  )}
                >
                  {concluida && !ativa ? <Check className="w-4 h-4" /> : <Icone className="w-4 h-4" />}
                </span>
                <span className={cn('text-sm font-medium hidden sm:block', ativa ? 'text-slate-800' : 'text-slate-400')}>
                  {e.label}
                </span>
              </button>
              {indice < ETAPAS.length - 1 && (
                <span className={cn('h-px flex-1 mx-3', concluida ? 'bg-teal-200' : 'bg-slate-200')} />
              )}
            </div>
          )
        })}
      </div>

      {erro && <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm">{erro}</div>}

      {/* ---------- ETAPA 1 ---------- */}
      {etapa === 1 && (
        <form
          onSubmit={handleSubmit(salvarIdentidade)}
          className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5"
        >
          <div>
            <h2 className="font-medium text-slate-800">Dados básicos e registro profissional</h2>
            <p className="text-xs text-slate-500 mt-1">
              Preencha exatamente como consta nos seus documentos — divergências atrasam a análise.
            </p>
          </div>

          <Campo label="Nome completo (igual ao documento)" erro={errors.full_name_document?.message}>
            <input
              type="text"
              disabled={!emEdicao}
              {...register('full_name_document')}
              className={inputClasse}
            />
          </Campo>

          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="CPF" erro={errors.cpf?.message}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000.000.000-00"
                disabled={!emEdicao}
                {...register('cpf')}
                value={formatarCPF(cpfDigitado)}
                onChange={(e) => setValue('cpf', formatarCPF(e.target.value), { shouldValidate: false })}
                className={inputClasse}
              />
            </Campo>

            <Campo label="Data de nascimento" erro={errors.birth_date?.message}>
              <input type="date" disabled={!emEdicao} {...register('birth_date')} className={inputClasse} />
            </Campo>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Campo label="Região do CRP" erro={errors.crp_region?.message}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="06"
                maxLength={2}
                disabled={!emEdicao}
                {...register('crp_region')}
                className={inputClasse}
              />
            </Campo>

            <Campo label="Número do CRP" erro={errors.crp_number?.message}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="123456"
                disabled={!emEdicao}
                {...register('crp_number')}
                className={inputClasse}
              />
            </Campo>

            <Campo label="Estado do CRP" erro={errors.crp_state?.message}>
              <select disabled={!emEdicao} {...register('crp_state')} className={inputClasse}>
                <option value="">UF</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
          </div>

          <p className="text-xs text-slate-400 -mt-1">
            Seu registro completo ficará: <span className="font-medium text-slate-600">
              {formatarCRP(watch('crp_region') || null, watch('crp_number') || null)}
            </span>
          </p>

          <Campo label="Telefone com DDD" erro={errors.phone?.message}>
            <input type="tel" placeholder="(11) 90000-0000" {...register('phone')} className={inputClasse} />
          </Campo>

          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-sm font-medium text-slate-800 mt-4">Dados para recebimento</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Exigidos pela instituição de pagamento para abrir a conta que recebe seus repasses. Não aparecem no seu
              perfil público — só a equipe de verificação enxerga.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Campo label="CEP" erro={errors.postal_code?.message}>
              <input
                type="text"
                inputMode="numeric"
                placeholder="00000-000"
                disabled={!emEdicao}
                {...register('postal_code')}
                className={inputClasse}
              />
            </Campo>
            <div className="sm:col-span-2">
              <Campo label="Logradouro" erro={errors.address_street?.message}>
                <input
                  type="text"
                  placeholder="Rua, avenida..."
                  disabled={!emEdicao}
                  {...register('address_street')}
                  className={inputClasse}
                />
              </Campo>
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <Campo label="Número" erro={errors.address_number?.message}>
              <input type="text" disabled={!emEdicao} {...register('address_number')} className={inputClasse} />
            </Campo>
            <Campo label="Complemento (opcional)" erro={errors.address_complement?.message}>
              <input type="text" disabled={!emEdicao} {...register('address_complement')} className={inputClasse} />
            </Campo>
            <Campo label="Bairro" erro={errors.address_district?.message}>
              <input type="text" disabled={!emEdicao} {...register('address_district')} className={inputClasse} />
            </Campo>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Campo label="Cidade" erro={errors.address_city?.message}>
                <input type="text" disabled={!emEdicao} {...register('address_city')} className={inputClasse} />
              </Campo>
            </div>
            <Campo label="Estado" erro={errors.address_state?.message}>
              <select disabled={!emEdicao} {...register('address_state')} className={inputClasse}>
                <option value="">UF</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </Campo>
          </div>

          <Campo label="Renda mensal aproximada" erro={errors.income_value?.message}>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 5000"
              disabled={!emEdicao}
              {...register('income_value')}
              className={inputClasse}
            />
          </Campo>

          <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
            E-mail da conta: <span className="text-slate-700">{emailConta || '—'}</span>
            <span className="block mt-0.5 text-slate-400">Para trocar o e-mail, use a página de perfil.</span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !emEdicao}
            className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {isSubmitting ? 'Salvando...' : 'Salvar e continuar'}
            {!isSubmitting && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>
      )}

      {/* ---------- ETAPA 2 ---------- */}
      {etapa === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <h2 className="font-medium text-slate-800">Documentos obrigatórios</h2>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Aceitamos JPG, PNG, WEBP ou PDF, até 8MB por arquivo. Todos os documentos vão para um armazenamento
              privado e criptografado — só você e a equipe de verificação conseguem abri-los. Eles nunca aparecem
              no seu perfil público nem para pacientes.
            </p>
          </div>

          {sucessoEtapa1 && (
            <div className="bg-teal-50 text-teal-700 px-4 py-3 rounded-xl text-sm">Dados salvos com sucesso.</div>
          )}

          {psicologo && (
            <div className="space-y-3">
              {DOCUMENTOS_OBRIGATORIOS.map((doc) => (
                <DocumentUpload
                  key={doc.tipo}
                  userId={userId}
                  psychologistId={psicologo.id}
                  tipo={doc.tipo}
                  label={doc.label}
                  descricao={doc.descricao}
                  documento={documentos.find((d) => d.doc_type === doc.tipo) || null}
                  bloqueado={!emEdicao}
                  onEnviado={(novo) =>
                    setDocumentos((atual) => [...atual.filter((d) => d.doc_type !== novo.doc_type), novo])
                  }
                />
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setEtapa(1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={() => setEtapa(3)}
              disabled={!todosDocumentosEnviados}
              className="flex-1 flex items-center justify-center gap-2 bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
            >
              {todosDocumentosEnviados
                ? 'Continuar'
                : `Faltam ${DOCUMENTOS_OBRIGATORIOS.length - documentosEnviados.size} documento(s)`}
              {todosDocumentosEnviados && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* ---------- ETAPA 3 ---------- */}
      {etapa === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100">
            {DECLARACOES.map((d) => (
              <label key={d.chave} className="flex items-start gap-3 p-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(aceites[d.chave])}
                  onChange={(e) => setAceites((atual) => ({ ...atual, [d.chave]: e.target.checked }))}
                  className="mt-1 w-4 h-4 accent-teal-700 flex-shrink-0"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800 mb-1">{d.titulo}</span>
                  <span className="block text-xs text-slate-500 leading-relaxed">{d.texto}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setEtapa(2)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" /> Voltar
            </button>
            <button
              type="button"
              onClick={enviarParaAnalise}
              disabled={!todasDeclaracoesAceitas || !todosDocumentosEnviados || enviandoAnalise || salvandoTermos}
              className="flex-1 flex items-center justify-center gap-2 bg-teal-700 text-white py-2.5 rounded-xl text-sm font-medium hover:bg-teal-800 disabled:opacity-50"
            >
              {(enviandoAnalise || salvandoTermos) && <Loader2 className="w-4 h-4 animate-spin" />}
              {enviandoAnalise ? 'Enviando...' : 'Enviar para análise'}
            </button>
          </div>

          <p className="text-xs text-slate-400 text-center">
            A análise leva até 48 horas úteis. Você recebe um e-mail com a decisão.
          </p>
        </div>
      )}
    </Moldura>
  )
}

// ============================================================
// Blocos auxiliares
// ============================================================

const inputClasse =
  'w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-teal-500 disabled:bg-slate-50 disabled:text-slate-500'

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-50">
      <Header backHref="/dashboard" />
      <div className="max-w-2xl mx-auto px-6 md:px-8 py-10 space-y-6">{children}</div>
    </main>
  )
}

function Campo({ label, erro, children }: { label: string; erro?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700 block mb-1">{label}</label>
      {children}
      {erro && <p className="text-xs text-red-600 mt-1">{erro}</p>}
    </div>
  )
}

const CORES_PAINEL = {
  teal: 'bg-teal-50 text-teal-700 border-teal-100',
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  red: 'bg-red-50 text-red-700 border-red-100',
} as const

function PainelStatus({
  icone, cor, titulo, texto, rodape,
}: {
  icone: React.ReactNode
  cor: keyof typeof CORES_PAINEL
  titulo: string
  texto: string
  rodape?: string
}) {
  return (
    <div className={cn('rounded-2xl border p-5 flex items-start gap-4', CORES_PAINEL[cor])}>
      <span className="flex-shrink-0 mt-0.5">{icone}</span>
      <div>
        <p className="font-medium mb-1">{titulo}</p>
        <p className="text-sm leading-relaxed opacity-90">{texto}</p>
        {rodape && <p className="text-xs mt-2 opacity-70">{rodape}</p>}
      </div>
    </div>
  )
}

function ResumoIdentidade({ psicologo }: { psicologo: Psychologist }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-5 grid sm:grid-cols-2 gap-4 text-sm">
      <Info label="Nome no documento" valor={psicologo.full_name_document} />
      <Info label="Registro profissional" valor={formatarCRP(psicologo.crp_region, psicologo.crp_number)} />
      <Info label="CPF" valor={psicologo.cpf ? formatarCPF(psicologo.cpf) : null} />
      <Info label="Estado do CRP" valor={psicologo.crp_state} />
      {psicologo.approved_at && (
        <div className="sm:col-span-2 flex items-center gap-2 text-xs text-teal-700 pt-1">
          <ShieldCheck className="w-3.5 h-3.5" />
          Verificado em {formatarData(psicologo.approved_at)}
        </div>
      )}
    </div>
  )
}

function Info({ label, valor }: { label: string; valor: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className="text-slate-700">{valor || '—'}</p>
    </div>
  )
}

function traduzirErro(error: { code?: string; message?: string }): string {
  console.error('Erro ao salvar dados de verificação:', error)

  if (error.code === '23505') {
    if (error.message?.includes('cpf')) return 'Esse CPF já está cadastrado em outra conta.'
    if (error.message?.includes('crp_number')) return 'Esse número de CRP já está cadastrado em outra conta.'
    return 'Alguma informação já está cadastrada em outra conta.'
  }
  if (error.code === '42501') {
    return 'Você não tem permissão para salvar esses dados. Faça login novamente e tente de novo.'
  }
  return 'Não foi possível salvar seus dados. Tente novamente em instantes.'
}
