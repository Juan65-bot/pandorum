-- Corrige um bug encontrado testando o webhook contra produção: a liberação
-- automática de horário não pago NUNCA funcionou.
--
-- A 0015 criou check_cancellation_allowed, que recusa cancelar sessão cujo
-- ends_at já passou. A regra é boa e continua valendo para gente: existe para
-- impedir que alguém cancele uma sessão retroativamente e escape da multa.
--
-- Mas ela também barra a plataforma. Tanto o webhook (PAYMENT_OVERDUE) quanto
-- o cron diário liberam horário fazendo exatamente
--   update ... set status='cancelled' where status='scheduled' and ends_at < now()
-- e levavam 23514 "Sessão que já terminou não pode ser cancelada" em todas as
-- linhas. O erro era só logado, então o sintoma era silencioso: o agendamento
-- ficava preso em 'scheduled' para sempre, e gerarSlotsDisponiveis trata
-- 'scheduled' como ocupado — o horário sumia da agenda do psicólogo sem nunca
-- ter gerado receita. Era o bug que a rede de segurança deveria evitar.
--
-- Reproduzido em produção antes desta correção:
--   PATCH appointments?status=eq.scheduled {"status":"cancelled",...}
--   -> 400 {"code":"23514","message":"Sessão que já terminou não pode ser cancelada"}
--
-- A saída é abrir exceção para cancelamento com autor 'system'. Não é brecha:
-- protect_cancellation_fields sobrescreve cancelled_by_role para todo usuário
-- comum, então paciente e psicólogo não conseguem se declarar 'system'.

create or replace function public.check_cancellation_allowed()
returns trigger as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.status = 'completed' then
      raise exception 'Sessão já concluída não pode ser cancelada'
        using errcode = 'check_violation';
    end if;

    -- 'system' é a plataforma liberando horário que nunca foi pago; para ela,
    -- a sessão ter passado é justamente a condição de execução, não um erro.
    if old.ends_at < now() and new.cancelled_by_role is distinct from 'system' then
      raise exception 'Sessão que já terminou não pode ser cancelada'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- o trigger em si não muda, só o corpo da função acima
