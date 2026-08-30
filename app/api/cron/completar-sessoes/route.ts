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

  const agora = new Date().toISOString()

  const { data, error } = await admin
    .from('appointments')
    .update({ status: 'completed' })
    .eq('status', 'confirmed')
    .lt('ends_at', agora)
    .select('id')

  if (error) {
    console.error('Erro ao marcar sessões como concluídas:', error)
    return NextResponse.json({ error: 'Falha ao atualizar sessões' }, { status: 500 })
  }

  // Rede de segurança para o horário que nunca foi pago.
  //
  // O caminho normal é o webhook PAYMENT_OVERDUE liberar o horário, mas ele não
  // cobre agendamento de curtíssimo prazo: o Asaas trabalha com DATA de
  // vencimento, não com hora, então uma sessão marcada para daqui a 2 horas tem
  // a cobrança vencendo "hoje" e só vira OVERDUE depois que o dia acabar —
  // muito depois de a sessão já ter passado. Sem isto, o horário ficaria em
  // 'scheduled' (que gerarSlotsDisponiveis trata como ocupado) e sumiria da
  // agenda do psicólogo sem nunca ter gerado receita.
  const { data: abandonadas, error: erroAbandonadas } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: agora,
      cancelled_by_role: 'system',
      cancelled_reason: 'Pagamento não confirmado até o horário da sessão — horário liberado automaticamente',
    })
    .eq('status', 'scheduled')
    .lt('ends_at', agora)
    .select('id')

  if (erroAbandonadas) {
    console.error('Erro ao liberar horários não pagos:', erroAbandonadas)
  }

  return NextResponse.json({
    ok: true,
    sessoesConcluidas: data?.length ?? 0,
    horariosLiberados: abandonadas?.length ?? 0,
  })
}
