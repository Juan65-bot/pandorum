import type { SupabaseClient } from '@supabase/supabase-js'
import { descriptografar } from '@/lib/crypto'
import { obterSaldoSubconta, asaasConfigurado } from '@/lib/asaas'
import { enviarEmail, emailLembreteSaque } from '@/lib/email'
import { capitalizarNome } from '@/lib/utils'
import { PREFERENCIAS_LEMBRETE_SAQUE, type PreferenciaLembreteSaque } from '@/lib/types'

/** Valor abaixo do qual não vale a pena incomodar ninguém com um e-mail. */
const SALDO_MINIMO_PARA_AVISAR = 1

/**
 * Decide se hoje é dia de avisar, para cada preferência.
 *
 * 'imediato' é atendido pelo mesmo disparo diário, e não a cada pagamento: o
 * cron da Vercel no plano Hobby só roda uma vez por dia (ver README), então
 * prometer "assim que entrar" ao pé da letra seria mentira. O texto da opção na
 * tela diz "assim que entrar", e é o mais próximo disso que a infraestrutura
 * atual entrega — quem quiser saber na hora tem o saldo no painel.
 */
function deveAvisarHoje(pref: PreferenciaLembreteSaque, agora: Date): boolean {
  switch (pref) {
    case 'imediato':
      return true
    case 'semanal':
      return agora.getDay() === 5 // sexta-feira
    case 'mensal':
      return agora.getDate() === 20
    case 'nunca':
    default:
      return false
  }
}

/**
 * Envia o lembrete de saldo disponível a quem pediu para ser avisado hoje.
 *
 * Roda dentro do cron diário que já existe, em vez de virar um segundo cron
 * job: o plano Hobby da Vercel limita a quantidade de crons, e um schedule a
 * mais já derrubou o deploy deste projeto uma vez — a Vercel recusa criar o
 * deployment inteiro, sem build nenhum aparecer no painel.
 *
 * Falha de um psicólogo não interrompe os outros: cada um é tratado por si, e
 * o erro vai para o log. Um saldo que não pôde ser consultado simplesmente não
 * gera e-mail, o que é melhor que enviar um valor errado.
 */
export async function enviarLembretesDeSaque(admin: SupabaseClient): Promise<number> {
  if (!asaasConfigurado()) return 0

  const agora = new Date()

  const { data: psicologos, error } = await admin
    .from('psychologists')
    .select('id, withdrawal_reminder, profiles!profile_id(full_name, email)')
    .eq('status', 'approved')
    .not('asaas_wallet_id', 'is', null)

  if (error) {
    console.error('Erro ao listar psicólogos para lembrete de saque:', error)
    return 0
  }

  let enviados = 0

  for (const psi of psicologos || []) {
    const pref = (psi.withdrawal_reminder || 'semanal') as PreferenciaLembreteSaque
    if (!deveAvisarHoje(pref, agora)) continue

    const perfil = psi.profiles as unknown as { full_name: string | null; email: string | null } | null
    if (!perfil?.email) continue

    try {
      const { data: cred } = await admin
        .from('psychologist_asaas_credentials')
        .select('api_key_encrypted')
        .eq('psychologist_id', psi.id)
        .maybeSingle()

      const chave = descriptografar(cred?.api_key_encrypted)
      if (!chave) continue

      const saldo = await obterSaldoSubconta(chave)
      if (saldo < SALDO_MINIMO_PARA_AVISAR) continue

      const rotulo = PREFERENCIAS_LEMBRETE_SAQUE.find((p) => p.valor === pref)?.label || ''
      const { assunto, html } = emailLembreteSaque(
        capitalizarNome(perfil.full_name) || 'psicólogo(a)',
        saldo,
        rotulo.toLowerCase()
      )

      const r = await enviarEmail({ para: perfil.email, assunto, html })
      if (r.enviado) enviados++
    } catch (erro) {
      console.error('Falha no lembrete de saque de', psi.id, erro)
    }
  }

  return enviados
}
