import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Marca como "completed" toda sessão confirmada cujo horário já passou.
 * Chamado pelo Vercel Cron (ver vercel.json) — a Vercel manda automaticamente
 * o header "Authorization: Bearer $CRON_SECRET" nas chamadas agendadas.
 * Também pode ser chamado manualmente (ex.: teste local) com o mesmo header.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  const { data, error } = await admin
    .from('appointments')
    .update({ status: 'completed' })
    .eq('status', 'confirmed')
    .lt('ends_at', new Date().toISOString())
    .select('id')

  if (error) {
    console.error('Erro ao marcar sessões como concluídas:', error)
    return NextResponse.json({ error: 'Falha ao atualizar sessões' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sessoesConcluidas: data?.length ?? 0 })
}
