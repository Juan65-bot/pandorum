-- Troca do Stripe pelo Asaas como gateway de pagamento.
--
-- Motivação: PIX com taxa fixa de R$ 1,99 contra percentual do Stripe, split
-- nativo com PIX e liquidação instantânea, e boa parte do público brasileiro
-- não tem cartão de crédito.
--
-- A tabela payments está VAZIA (0 linhas na data desta migration), então dá
-- para renomear coluna sem migrar dado histórico. Se isso mudar, revisar.
--
-- Idempotente: pode rodar mais de uma vez.

-- ============================================================
-- 1. payments — neutraliza o nome do gateway e guarda o que o Asaas devolve
-- ============================================================

-- stripe_payment_id vira gateway_payment_id: o nome do fornecedor não deve
-- estar no schema, ou a próxima troca de gateway exige outra migration dessas.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'stripe_payment_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'gateway_payment_id'
  ) then
    alter table public.payments rename column stripe_payment_id to gateway_payment_id;
  end if;
end $$;

alter table public.payments
  add column if not exists gateway_payment_id text,
  -- invoiceUrl do Asaas: é para onde o paciente é mandado para pagar, e continua
  -- servindo depois (a mesma URL mostra o comprovante quando já foi pago)
  add column if not exists gateway_invoice_url text,
  -- PIX / CREDIT_CARD / UNDEFINED. Guardado porque a taxa do gateway muda com
  -- ele, e sem isso não dá para explicar por que a margem variou entre sessões.
  add column if not exists billing_type text,
  -- valor que sobra para a plataforma depois da taxa do Asaas. Só é conhecido
  -- quando o pagamento confirma, por isso nullable.
  add column if not exists net_value numeric(10, 2),
  add column if not exists due_date date;

create index if not exists payments_gateway_payment_id_idx
  on public.payments(gateway_payment_id) where gateway_payment_id is not null;

-- ============================================================
-- 2. psychologists — subconta Asaas, endereço e preferência de saque
-- ============================================================
-- O endereço não é capricho: POST /v3/accounts exige CEP, logradouro, número,
-- bairro, cidade, estado e incomeValue. Sem isso a subconta não nasce, e sem
-- subconta não existe walletId — logo, não existe split.

alter table public.psychologists
  add column if not exists asaas_account_id text,
  add column if not exists asaas_wallet_id text,
  -- a criação da subconta acontece na aprovação da verificação e pode falhar
  -- (dados recusados, conta-mãe ainda PF). Guardar o erro deixa o admin ver o
  -- motivo na tela em vez de precisar caçar no log do servidor.
  add column if not exists asaas_account_error text,
  add column if not exists postal_code text,
  add column if not exists address_street text,
  add column if not exists address_number text,
  add column if not exists address_complement text,
  add column if not exists address_district text,
  add column if not exists address_city text,
  add column if not exists address_state text,
  add column if not exists income_value numeric(10, 2),
  add column if not exists withdrawal_reminder text
    check (withdrawal_reminder in ('imediato', 'semanal', 'mensal', 'nunca'));

alter table public.psychologists alter column withdrawal_reminder set default 'semanal';
update public.psychologists set withdrawal_reminder = 'semanal' where withdrawal_reminder is null;

create unique index if not exists psychologists_asaas_wallet_idx
  on public.psychologists(asaas_wallet_id) where asaas_wallet_id is not null;

-- ============================================================
-- 3. patients — CPF
-- ============================================================
-- POST /v3/customers do Asaas exige cpfCnpj. Sem CPF do paciente não há como
-- gerar cobrança nenhuma.

alter table public.patients
  add column if not exists cpf text;

create unique index if not exists patients_cpf_idx
  on public.patients(cpf) where cpf is not null;

-- ============================================================
-- 4. Protege os campos da subconta
-- ============================================================
-- Mesmo raciocínio do trigger de aprovação: RLS decide QUAL LINHA, nunca QUAIS
-- COLUNAS. Sem isto, um psicólogo poderia apontar o próprio walletId para outro
-- lugar — ou pior, para a carteira de terceiro — via PATCH direto na API.

create or replace function public.protect_asaas_fields()
returns trigger as $$
begin
  if not public.is_admin() then
    new.asaas_account_id := old.asaas_account_id;
    new.asaas_wallet_id := old.asaas_wallet_id;
    new.asaas_account_error := old.asaas_account_error;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists psychologists_protect_asaas on public.psychologists;
create trigger psychologists_protect_asaas
  before update on public.psychologists
  for each row execute function public.protect_asaas_fields();

-- ============================================================
-- 5. 'system' como autor de cancelamento
-- ============================================================
-- A 0015 só previa patient/psychologist/admin. Com a cobrança vencendo 24h
-- antes da sessão, passa a existir um cancelamento que ninguém fez: o horário
-- liberado automaticamente quando o pagamento não confirma até o vencimento.
-- Sem este valor o webhook violaria a check constraint e o horário ficaria
-- preso em 'scheduled' — exatamente o bug que ele existe para evitar.

alter table public.appointments drop constraint if exists appointments_cancelled_by_role_check;
alter table public.appointments
  add constraint appointments_cancelled_by_role_check
  check (cancelled_by_role is null or cancelled_by_role in ('patient', 'psychologist', 'admin', 'system'));

-- Nenhum grant novo aqui de propósito: payments, psychologists e patients já
-- nasceram pelo dashboard e têm os grants padrão do Supabase. Quem filtra
-- continua sendo a RLS.
