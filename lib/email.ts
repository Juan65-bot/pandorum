/**
 * Envio de e-mail transacional via Resend, por fetch direto na API HTTP —
 * de propósito sem SDK, para não adicionar dependência só por causa de um POST.
 *
 * Se RESEND_API_KEY não estiver configurada, nada quebra: o e-mail é registrado
 * no log do servidor e a função devolve { enviado: false }. Isso é intencional —
 * aprovar ou rejeitar um psicólogo não pode falhar porque o provedor de e-mail
 * está fora do ar ou ainda não foi contratado.
 *
 * Uso exclusivo em rotas de API/código de servidor: RESEND_API_KEY não tem
 * prefixo NEXT_PUBLIC_, então importar isso de um componente client faria a
 * chave virar `undefined` no bundle (nunca vazaria, mas nunca funcionaria).
 */

const REMETENTE_PADRAO = 'Pandorum <verificacao@pandorum.com.br>'

interface EnviarEmailParams {
  para: string
  assunto: string
  html: string
}

export async function enviarEmail({ para, assunto, html }: EnviarEmailParams) {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY ausente — e-mail "${assunto}" para ${para} não foi enviado.`)
    return { enviado: false as const, motivo: 'RESEND_API_KEY não configurada' }
  }

  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_REMETENTE || REMETENTE_PADRAO,
        to: [para],
        subject: assunto,
        html,
      }),
    })

    if (!resposta.ok) {
      const detalhe = await resposta.text()
      console.error(`[email] Falha ao enviar "${assunto}" para ${para}:`, resposta.status, detalhe)
      return { enviado: false as const, motivo: `Resend respondeu ${resposta.status}` }
    }

    return { enviado: true as const }
  } catch (erro) {
    console.error(`[email] Erro de rede ao enviar "${assunto}" para ${para}:`, erro)
    return { enviado: false as const, motivo: 'Erro de rede' }
  }
}

// ============================================================
// Template base
// ============================================================

function layout({ titulo, corpo, cta }: { titulo: string; corpo: string; cta?: { label: string; href: string } }) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pandorum.vercel.app'

  return `
<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="background:linear-gradient(135deg,#115e59,#134e4a);padding:24px 32px;">
                <span style="font-size:20px;color:#ffffff;font-family:Georgia,serif;">Pan<span style="color:#5eead4;">dorum</span></span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;font-family:Georgia,serif;color:#1e293b;font-weight:normal;">${titulo}</h1>
                <div style="font-size:14px;line-height:1.7;color:#475569;">${corpo}</div>
                ${
                  cta
                    ? `<div style="margin-top:28px;">
                         <a href="${cta.href}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:500;">${cta.label}</a>
                       </div>`
                    : ''
                }
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;">
                Este é um e-mail automático do <a href="${siteUrl}" style="color:#0f766e;text-decoration:none;">Pandorum</a>.
                Se você não reconhece este cadastro, ignore esta mensagem.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
}

function escapar(texto: string) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function urlPerfil() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pandorum.vercel.app'
  return `${siteUrl}/psicologo/verificacao`
}

// ============================================================
// As quatro notificações da verificação
// ============================================================

export function emailDocumentosRecebidos(nome: string) {
  return {
    assunto: 'Recebemos seus documentos — análise em até 48h',
    html: layout({
      titulo: `Documentos recebidos, ${escapar(nome)}`,
      corpo: `
        <p>Recebemos todos os documentos do seu cadastro profissional. Ele entrou na fila de análise da nossa equipe.</p>
        <p>Vamos conferir seu registro no <strong>Cadastro Nacional de Psicólogos do CFP</strong> e validar os documentos enviados.
        O prazo de análise é de <strong>até 48 horas úteis</strong>.</p>
        <p>Você recebe um novo e-mail assim que houver uma decisão. Não é preciso fazer nada até lá.</p>
      `,
      cta: { label: 'Acompanhar meu cadastro', href: urlPerfil() },
    }),
  }
}

export function emailAprovado(nome: string) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pandorum.vercel.app'
  return {
    assunto: 'Cadastro aprovado — você já pode atender no Pandorum',
    html: layout({
      titulo: `Tudo certo, ${escapar(nome)}!`,
      corpo: `
        <p>Seu cadastro foi <strong>verificado e aprovado</strong>. Seu registro no CRP foi conferido junto ao Conselho Federal de Psicologia.</p>
        <p>A partir de agora:</p>
        <ul style="padding-left:20px;margin:12px 0;">
          <li style="margin-bottom:6px;">Seu perfil aparece na busca pública com o selo <strong>Psicólogo verificado</strong>.</li>
          <li style="margin-bottom:6px;">Pacientes já podem agendar sessões com você.</li>
          <li>Configure seus horários de atendimento para começar a receber agendamentos.</li>
        </ul>
      `,
      cta: { label: 'Configurar meus horários', href: `${siteUrl}/psicologo/completar-perfil` },
    }),
  }
}

export function emailRejeitado(nome: string, motivo: string) {
  return {
    assunto: 'Sobre a análise do seu cadastro no Pandorum',
    html: layout({
      titulo: `${escapar(nome)}, seu cadastro não foi aprovado`,
      corpo: `
        <p>Analisamos os documentos enviados e não foi possível aprovar seu cadastro neste momento.</p>
        <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:14px 16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:12px;color:#991b1b;text-transform:uppercase;letter-spacing:0.04em;">Motivo</p>
          <p style="margin:0;color:#7f1d1d;">${escapar(motivo)}</p>
        </div>
        <p>Se acredita que houve um engano ou quer corrigir as informações, você pode revisar seus dados e reenviar os documentos.</p>
      `,
      cta: { label: 'Revisar meu cadastro', href: urlPerfil() },
    }),
  }
}

export function emailDocumentoAdicional(nome: string, descricao: string) {
  return {
    assunto: 'Precisamos de um documento adicional para concluir sua verificação',
    html: layout({
      titulo: `${escapar(nome)}, falta um documento`,
      corpo: `
        <p>Estamos analisando seu cadastro, mas precisamos de um item adicional para concluir a verificação.</p>
        <div style="background:#fffbeb;border-left:3px solid #d97706;padding:14px 16px;border-radius:8px;margin:16px 0;">
          <p style="margin:0 0 6px;font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:0.04em;">O que precisamos</p>
          <p style="margin:0;color:#78350f;">${escapar(descricao)}</p>
        </div>
        <p>Assim que você enviar, seu cadastro volta automaticamente para a fila de análise.</p>
      `,
      cta: { label: 'Enviar documento', href: urlPerfil() },
    }),
  }
}

// ============================================================
// Cancelamento de sessão
// ============================================================

interface DadosCancelamento {
  dataHoraSessao: string
  canceladoPor: 'patient' | 'psychologist' | 'admin'
  nomePaciente: string
  nomePsicologo: string
  resultado: {
    tardio: boolean
    valorMulta: number
    repassePsicologo: number
    comissaoPlataforma: number
    explicacao: string
  }
}

function reais(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function dataHoraBR(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function caixa(cor: 'verde' | 'ambar', titulo: string, corpo: string) {
  const paleta = cor === 'verde'
    ? { fundo: '#f0fdfa', borda: '#0f766e', titulo: '#115e59', texto: '#134e4a' }
    : { fundo: '#fffbeb', borda: '#d97706', titulo: '#92400e', texto: '#78350f' }
  return `<div style="background:${paleta.fundo};border-left:3px solid ${paleta.borda};padding:14px 16px;border-radius:8px;margin:16px 0;">
    <p style="margin:0 0 6px;font-size:12px;color:${paleta.titulo};text-transform:uppercase;letter-spacing:0.04em;">${titulo}</p>
    <div style="margin:0;color:${paleta.texto};">${corpo}</div>
  </div>`
}

export function emailCancelamentoPaciente(d: DadosCancelamento) {
  const quem = d.canceladoPor === 'patient' ? 'Você cancelou' : `${escapar(d.nomePsicologo)} cancelou`

  const financeiro = d.resultado.tardio
    ? caixa('ambar', 'Taxa de cancelamento',
        `<p style="margin:0 0 8px;">Como o cancelamento foi feito com menos de 24h de antecedência, foi retida uma taxa de <strong>${reais(d.resultado.valorMulta)}</strong>, equivalente a 50% do valor da sessão.</p>
         <p style="margin:0;font-size:13px;">Se você já havia pago a sessão integralmente, a diferença é devolvida pelo mesmo meio de pagamento em até 10 dias úteis.</p>`)
    : caixa('verde', 'Sem cobrança',
        `<p style="margin:0;">Nenhum valor foi cobrado. Se a sessão já estava paga, o reembolso integral é processado pelo mesmo meio de pagamento em até 10 dias úteis.</p>`)

  return {
    assunto: 'Sessão cancelada — Pandorum',
    html: layout({
      titulo: 'Sua sessão foi cancelada',
      corpo: `
        <p>${quem} a sessão marcada para <strong>${dataHoraBR(d.dataHoraSessao)}</strong> com ${escapar(d.nomePsicologo)}.</p>
        ${financeiro}
        <p>Você pode agendar um novo horário quando quiser.</p>
      `,
      cta: { label: 'Agendar nova sessão', href: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://pandorum.vercel.app'}/psicologos` },
    }),
  }
}

export function emailCancelamentoPsicologo(d: DadosCancelamento) {
  const quem = d.canceladoPor === 'psychologist' ? 'Você cancelou' : `${escapar(d.nomePaciente)} cancelou`

  const financeiro = d.resultado.tardio
    ? caixa('verde', 'Repasse pelo cancelamento tardio',
        `<p style="margin:0 0 8px;">O paciente cancelou com menos de 24h de antecedência, então a taxa de ${reais(d.resultado.valorMulta)} foi aplicada.</p>
         <p style="margin:0;">Seu repasse: <strong>${reais(d.resultado.repassePsicologo)}</strong> (70%). Comissão da plataforma: ${reais(d.resultado.comissaoPlataforma)} (30%).</p>`)
    : d.canceladoPor === 'psychologist'
      ? caixa('ambar', 'Sem cobrança ao paciente',
          `<p style="margin:0;">Cancelamentos feitos pelo profissional nunca geram cobrança ao paciente, independente da antecedência. Não há repasse referente a esta sessão.</p>`)
      : caixa('ambar', 'Sem cobrança',
          `<p style="margin:0;">O cancelamento foi feito com mais de 24h de antecedência, dentro do prazo gratuito. Não há repasse referente a esta sessão.</p>`)

  return {
    assunto: 'Sessão cancelada — Pandorum',
    html: layout({
      titulo: 'Uma sessão da sua agenda foi cancelada',
      corpo: `
        <p>${quem} a sessão de <strong>${dataHoraBR(d.dataHoraSessao)}</strong> com ${escapar(d.nomePaciente)}.</p>
        ${financeiro}
        <p>O horário voltou a ficar disponível na sua agenda automaticamente.</p>
      `,
      cta: { label: 'Ver minha agenda', href: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://pandorum.vercel.app'}/psicologo/agenda` },
    }),
  }
}
