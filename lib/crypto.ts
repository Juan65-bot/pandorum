import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

/**
 * Criptografia simétrica (AES-256-GCM) para dados clínicos sensíveis (LGPD).
 * Uso exclusivo em código de servidor — a chave nunca deve chegar ao browser,
 * por isso essas funções só são chamadas de dentro de rotas de API, nunca de
 * componentes client.
 */

function getChave(): Buffer {
  const chaveHex = process.env.SESSION_NOTES_ENCRYPTION_KEY
  if (!chaveHex || chaveHex.length !== 64) {
    throw new Error('SESSION_NOTES_ENCRYPTION_KEY ausente ou com tamanho inválido (esperado 64 caracteres hex / 32 bytes)')
  }
  return Buffer.from(chaveHex, 'hex')
}

/** Retorna uma string no formato "iv:tag:ciphertext" (tudo em base64), ou null se a entrada for vazia. */
export function criptografar(textoPlano: string | null | undefined): string | null {
  if (!textoPlano) return null

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getChave(), iv)
  const criptografado = Buffer.concat([cipher.update(textoPlano, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('base64')}:${tag.toString('base64')}:${criptografado.toString('base64')}`
}

/** Reverte criptografar(). Retorna null se a entrada for vazia ou não estiver no formato esperado. */
export function descriptografar(valorCriptografado: string | null | undefined): string | null {
  if (!valorCriptografado) return null

  const partes = valorCriptografado.split(':')
  if (partes.length !== 3) {
    // dado legado gravado antes da criptografia existir — devolve como veio
    // em vez de quebrar a tela, mas isso não deveria mais acontecer daqui pra frente.
    return valorCriptografado
  }

  const [ivB64, tagB64, dadosB64] = partes
  try {
    const decipher = createDecipheriv('aes-256-gcm', getChave(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    const decriptografado = Buffer.concat([decipher.update(Buffer.from(dadosB64, 'base64')), decipher.final()])
    return decriptografado.toString('utf8')
  } catch (err) {
    console.error('Falha ao descriptografar nota de sessão:', err)
    return null
  }
}
