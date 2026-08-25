-- Política de cancelamento.
--
-- Até aqui cancelar era um update solto de appointments.status feito pelo
-- browser: sem prazo, sem consequência financeira e sem registro de quem
-- cancelou. Agora o cancelamento tem regra (grátis acima de 24h, 50% abaixo
-- disso quando quem cancela é o paciente) e precisa deixar rastro dos dois
-- lados — no agendamento e no financeiro.
--
-- NÃO APLICADA AINDA — aguardando aprovação.
-- Idempotente: pode rodar mais de uma vez.

-- ============================================================
-- 1. Rastro do cancelamento no agendamento
-- ============================================================

alter table public.appointments
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancelled_by_role text
    check (cancelled_by_role is null or cancelled_by_role in ('patient', 'psychologist', 'admin')),
  -- horas de antecedência no momento do cancelamento, congeladas. Sem isso não
  -- dá para auditar depois se a multa foi aplicada corretamente: recalcular a
  -- partir de starts_at e cancelled_at funciona, mas perde o "agora" que o
  -- servidor realmente usou.
  add column if not exists cancellation_notice_hours numeric(6,1),
  add column if not exists late_cancellation boolean not null default false;

create index if not exists appointments_cancelled_idx
  on public.appointments(cancelled_at) where cancelled_at is not null;

-- ============================================================
-- 2. Financeiro do cancelamento
-- ============================================================

alter table public.payments
  add column if not exists is_late_cancellation boolean not null default false,
  add column if not exists refunded_amount numeric(10,2) not null default 0,
  add column if not exists cancellation_fee numeric(10,2) not null default 0;

comment on column public.payments.is_late_cancellation is
  'true quando esta linha existe por causa de cancelamento com menos de 24h de antecedência';
comment on column public.payments.cancellation_fee is
  'valor efetivamente retido do paciente pelo cancelamento tardio (0 em cancelamento gratuito)';
comment on column public.payments.refunded_amount is
  'valor devolvido ao paciente — total no cancelamento gratuito, parcial no tardio';

-- ============================================================
-- 3. Só quem participa da sessão pode cancelá-la
-- ============================================================
-- A RLS já limita o UPDATE de appointments a paciente/psicólogo envolvidos,
-- mas ela não sabe distinguir "cancelar" de qualquer outro update, nem impede
-- que o próprio cliente escreva os campos financeiros na mão. Este trigger
-- garante que os campos de cancelamento só sejam preenchidos de forma
-- coerente e por quem tem direito.

create or replace function public.protect_cancellation_fields()
returns trigger as $$
declare
  v_eh_paciente boolean;
  v_eh_psicologo boolean;
begin
  -- admin e service_role (webhook/rotas de servidor) passam direto
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;

  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    v_eh_paciente := old.patient_id = auth.uid();
    v_eh_psicologo := exists (
      select 1 from public.psychologists
      where id = old.psychologist_id and profile_id = auth.uid()
    );

    if not (v_eh_paciente or v_eh_psicologo) then
      raise exception 'Só o paciente ou o psicólogo da sessão podem cancelá-la'
        using errcode = 'insufficient_privilege';
    end if;

    -- Os campos que decidem dinheiro são calculados no servidor
    -- (app/api/sessoes/cancelar). Um cancelamento vindo direto do browser não
    -- pode se declarar "no prazo" para escapar da multa.
    new.late_cancellation := false;
    new.cancellation_notice_hours := null;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
    new.cancelled_by_role := case when v_eh_psicologo then 'psychologist' else 'patient' end;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists appointments_protect_cancellation on public.appointments;
create trigger appointments_protect_cancellation
  before update on public.appointments
  for each row execute function public.protect_cancellation_fields();

-- ============================================================
-- 4. Não se cancela o que já passou ou já acabou
-- ============================================================

create or replace function public.check_cancellation_allowed()
returns trigger as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    if old.status = 'completed' then
      raise exception 'Sessão já concluída não pode ser cancelada'
        using errcode = 'check_violation';
    end if;
    if old.ends_at < now() then
      raise exception 'Sessão que já terminou não pode ser cancelada'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists appointments_check_cancellation on public.appointments;
create trigger appointments_check_cancellation
  before update on public.appointments
  for each row execute function public.check_cancellation_allowed();
