-- Verificação de identidade do psicólogo — PARTE 2 de 2.
-- Rodar DEPOIS da 0012 (que adiciona os valores do enum), nunca junto.
--
-- Problema que isso resolve: até aqui qualquer pessoa criava conta de psicólogo
-- digitando um CRP inventado e caía direto na busca pública assim que um admin
-- clicasse em "aprovar" — sem nenhum documento para conferir. Agora o cadastro
-- só chega na fila de análise com identidade documentada, e só sai dela para
-- 'approved' pela mão de um admin, com registro imutável de quem aprovou.
--
-- Idempotente: pode rodar mais de uma vez.

-- ============================================================
-- 1. Campos de identidade e de análise em psychologists
-- ============================================================

alter table public.psychologists
  add column if not exists full_name_document text,
  add column if not exists cpf text,
  add column if not exists crp_region text,
  add column if not exists crp_state text,
  add column if not exists birth_date date,
  add column if not exists documents_submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists rejection_reason text,
  add column if not exists additional_document_request text,
  add column if not exists verification_terms_accepted_at timestamptz,
  add column if not exists verification_terms_version text;

-- CPF é identificador único de pessoa: dois cadastros com o mesmo CPF significa
-- que alguém está duplicando conta. Índice parcial porque cadastros antigos
-- ainda não têm CPF preenchido.
create unique index if not exists psychologists_cpf_idx
  on public.psychologists(cpf) where cpf is not null;

-- Migra o status legado 'pending' para o novo estado inicial. Quem já estava
-- aprovado/rejeitado/suspenso não é tocado.
--
-- O disable/enable em volta NÃO é opcional: psychologists_protect_approval
-- (criado na 0001) reverte qualquer alteração de status feita por quem
-- is_admin() não reconhece — e ao rodar migration não existe auth.uid(), então
-- nem o superusuário passa. Sem isso, este update é revertido em silêncio: a
-- migration termina com "sucesso" e as linhas continuam em 'pending'.
-- O DO block trata o caso de instalação nova, onde o trigger ainda não existe.
do $$
begin
  if exists (
    select 1 from pg_trigger
    where tgrelid = 'public.psychologists'::regclass
      and tgname = 'psychologists_protect_approval'
  ) then
    alter table public.psychologists disable trigger psychologists_protect_approval;
    update public.psychologists set status = 'pending_documents' where status = 'pending';
    alter table public.psychologists enable trigger psychologists_protect_approval;
  else
    update public.psychologists set status = 'pending_documents' where status = 'pending';
  end if;
end $$;

alter table public.psychologists alter column status set default 'pending_documents';

-- session_price é NOT NULL e nunca teve default: sem isso, criar um cadastro
-- pela etapa 1 da verificação (que só grava identidade) viola a constraint.
-- O valor é o mesmo travado pela 0011 — a plataforma define, o psicólogo não escolhe.
alter table public.psychologists alter column session_price set default 150.00;

-- ============================================================
-- 2. Documentos enviados
-- ============================================================
-- Só o caminho no Storage fica aqui. O arquivo em si vive no bucket privado
-- 'verification-documents' e só é acessível por URL assinada de curta duração.

create table if not exists public.psychologist_documents (
  id uuid primary key default gen_random_uuid(),
  psychologist_id uuid not null references public.psychologists(id) on delete cascade,
  doc_type text not null check (doc_type in ('crp_card', 'id_front', 'id_back', 'selfie_document', 'diploma')),
  storage_path text not null,
  mime_type text,
  file_size integer,
  uploaded_at timestamptz not null default now(),
  unique (psychologist_id, doc_type)
);

create index if not exists psychologist_documents_psi_idx
  on public.psychologist_documents(psychologist_id);

alter table public.psychologist_documents enable row level security;

-- Documento de identidade é dado sensível: só o dono e o admin, nunca paciente,
-- nunca outro psicólogo, nunca anônimo.
drop policy if exists "psy_docs_owner_all" on public.psychologist_documents;
create policy "psy_docs_owner_all" on public.psychologist_documents
  for all using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  ) with check (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  );

drop policy if exists "psy_docs_admin_all" on public.psychologist_documents;
create policy "psy_docs_admin_all" on public.psychologist_documents
  for all using (public.is_admin());

-- ============================================================
-- 3. Log de auditoria imutável
-- ============================================================

create table if not exists public.verification_audit_log (
  id uuid primary key default gen_random_uuid(),
  psychologist_id uuid not null references public.psychologists(id) on delete restrict,
  admin_id uuid references public.profiles(id),
  admin_name text,
  action text not null check (action in ('approved', 'rejected', 'requested_document', 'suspended', 'reinstated')),
  checklist jsonb,
  reason text,
  previous_status text,
  new_status text,
  created_at timestamptz not null default now()
);

create index if not exists verification_audit_log_psi_idx
  on public.verification_audit_log(psychologist_id, created_at desc);

alter table public.verification_audit_log enable row level security;

-- Imutável de verdade: sem policy de update/delete o PostgREST já barra, mas
-- o trigger abaixo garante que nem uma rotina no servidor (service_role, que
-- ignora RLS) consiga reescrever a história de uma aprovação.
create or replace function public.block_audit_log_mutation()
returns trigger as $$
begin
  raise exception 'verification_audit_log é imutável: registros de auditoria não podem ser alterados nem removidos';
end;
$$ language plpgsql;

drop trigger if exists verification_audit_log_immutable on public.verification_audit_log;
create trigger verification_audit_log_immutable
  before update or delete on public.verification_audit_log
  for each row execute function public.block_audit_log_mutation();

-- Leitura: admin vê tudo; o psicólogo vê o próprio histórico (ele tem direito
-- de saber por que foi rejeitado e quando foi analisado).
drop policy if exists "audit_log_admin_all" on public.verification_audit_log;
create policy "audit_log_admin_all" on public.verification_audit_log
  for all using (public.is_admin());

drop policy if exists "audit_log_select_own" on public.verification_audit_log;
create policy "audit_log_select_own" on public.verification_audit_log
  for select using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  );

-- ============================================================
-- 4. Documentos completos → entra na fila de análise
-- ============================================================

create or replace function public.documentos_completos(p_psychologist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct doc_type) = 5
  from public.psychologist_documents
  where psychologist_id = p_psychologist_id
    and doc_type in ('crp_card', 'id_front', 'id_back', 'selfie_document', 'diploma');
$$;

grant execute on function public.documentos_completos(uuid) to authenticated;

-- ============================================================
-- 5. Trigger de proteção — versão ampliada
-- ============================================================
-- Substitui a versão da 0001, que só cobria status/approved_at/approved_by.
-- Agora cobre também os campos novos de análise E congela os dados de
-- identidade depois que o cadastro sai da fase de documentos: sem isso um
-- psicólogo poderia ser aprovado com o CRP verdadeiro e trocar o número
-- depois, que é exatamente a fraude que essa feature existe para impedir.

create or replace function public.protect_psychologist_approval_fields()
returns trigger as $$
begin
  if not public.is_admin() then
    -- Única transição que o próprio psicólogo pode disparar: mandar o cadastro
    -- para análise. E só quando os 5 documentos obrigatórios existirem de fato
    -- no banco — a checagem é no servidor, não dá para forjar pelo client.
    if old.status in ('pending_documents', 'pending')
       and new.status = 'pending_review'
       and old.profile_id = auth.uid()
       and public.documentos_completos(old.id)
    then
      new.documents_submitted_at := coalesce(old.documents_submitted_at, now());
    else
      new.status := old.status;
      new.documents_submitted_at := old.documents_submitted_at;
    end if;

    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.rejection_reason := old.rejection_reason;
    new.additional_document_request := old.additional_document_request;

    -- Identidade só é editável enquanto o cadastro ainda está juntando
    -- documentos ou voltou rejeitado para correção.
    if old.status not in ('pending_documents', 'pending', 'rejected') then
      new.crp_number := old.crp_number;
      new.cpf := old.cpf;
      new.full_name_document := old.full_name_document;
      new.birth_date := old.birth_date;
      new.crp_region := old.crp_region;
      new.crp_state := old.crp_state;
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists psychologists_protect_approval on public.psychologists;
create trigger psychologists_protect_approval
  before update on public.psychologists
  for each row execute function public.protect_psychologist_approval_fields();

-- ============================================================
-- 6. Só psicólogo aprovado recebe agendamento
-- ============================================================
-- A RLS já esconde da busca quem não está aprovado, mas esconder não é impedir:
-- um id de psicólogo pendente obtido de outra forma ainda passaria pelo insert
-- direto na API. Isso fecha no banco.

create or replace function public.check_psychologist_approved()
returns trigger as $$
declare
  v_status public.psy_status;
begin
  select status into v_status from public.psychologists where id = new.psychologist_id;

  if v_status is distinct from 'approved' then
    raise exception 'Esse psicólogo não está disponível para agendamento (verificação pendente).'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists appointments_require_approved_psychologist on public.appointments;
create trigger appointments_require_approved_psychologist
  before insert on public.appointments
  for each row execute function public.check_psychologist_approved();

-- ============================================================
-- 7. Bucket privado dos documentos
-- ============================================================
-- public = false: nenhuma URL pública funciona, só URL assinada gerada no
-- servidor com validade curta. Caminho dos arquivos: {profile_id}/{doc_type}.{ext}

insert into storage.buckets (id, name, public)
values ('verification-documents', 'verification-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "verification_docs_owner_read" on storage.objects;
create policy "verification_docs_owner_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'verification-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "verification_docs_owner_insert" on storage.objects;
create policy "verification_docs_owner_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "verification_docs_owner_update" on storage.objects;
create policy "verification_docs_owner_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'verification-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "verification_docs_owner_delete" on storage.objects;
create policy "verification_docs_owner_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'verification-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ============================================================
-- 8. Grants
-- ============================================================
-- Tabela criada por SQL puro não herda os grants que o Supabase dá às tabelas
-- feitas pelo dashboard: sem isso, "authenticated" leva 42501 (permission
-- denied) antes mesmo da RLS ser consultada, e o psicólogo não consegue nem ler
-- os próprios documentos. Quem filtra QUAIS linhas continua sendo a RLS; o
-- grant só abre a porta da tabela.
--
-- anon fica de fora de propósito: documento de identidade e log de auditoria
-- não têm nenhuma leitura pública, ao contrário de psychologists/profiles.

grant all privileges on public.psychologist_documents to service_role;
grant all privileges on public.verification_audit_log to service_role;

grant select, insert, update, delete on public.psychologist_documents to authenticated;

-- sem update/delete: a auditoria é imutável (o trigger da seção 3 garante isso
-- mesmo para service_role, mas não custa também não conceder o privilégio)
grant select, insert on public.verification_audit_log to authenticated;
