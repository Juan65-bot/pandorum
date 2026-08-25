-- Corrige um beco sem saída encontrado testando o fluxo de verificação em
-- produção: um cadastro parado no status legado 'pending' não consegue mais
-- avançar nem ser editado.
--
-- Como acontece:
--   1. protect_psychologist_approval_fields (0013) congela os campos de
--      identidade quando o status não é 'pending_documents' nem 'rejected'.
--      'pending' não está nessa lista.
--   2. O update de migração da 0013 ('pending' -> 'pending_documents') é
--      revertido pelo próprio trigger quando roda sem auth.uid() — que é
--      exatamente o caso ao aplicar migration pela Management API.
--
-- Resultado: a linha fica em 'pending' para sempre. A tela mostra o formulário
-- como editável (o front trata 'pending' como fase de documentos), o psicólogo
-- preenche, salva, e os campos voltam nulos sem nenhum erro. É o pior tipo de
-- falha: silenciosa e sem pista para o usuário.
--
-- NÃO APLICADA AINDA — aguardando aprovação.
-- Idempotente.

-- ============================================================
-- 1. Migra o que ficou preso, com o trigger fora do caminho
-- ============================================================

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

-- ============================================================
-- 2. Aceita 'pending' como fase editável, por segurança
-- ============================================================
-- Depois do passo 1 nenhuma linha deveria estar em 'pending'. Incluir o valor
-- na lista mesmo assim é barato e garante que, se alguma linha aparecer nesse
-- estado por qualquer caminho, ela consiga se corrigir sozinha em vez de
-- travar em silêncio. Mesma função da 0013, com essa única diferença.

create or replace function public.protect_psychologist_approval_fields()
returns trigger as $$
begin
  if not public.is_admin() then
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

    -- 'pending' entra aqui junto com 'pending_documents': é a mesma fase do
    -- ponto de vista do usuário, e deixá-lo de fora é o que causava o travamento.
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
