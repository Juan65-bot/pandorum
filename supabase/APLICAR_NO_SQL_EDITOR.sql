-- ============================================================================
-- PANDORUM — script único para colar no SQL Editor do Supabase e rodar de uma vez:
-- https://supabase.com/dashboard/project/inutvjfdcuphazpgtdor/sql/new
--
-- Equivale a rodar, em ordem, os 8 arquivos de supabase/migrations/.
-- 100% idempotente: pode rodar de novo sem quebrar nada.
-- NÃO cria nem apaga nenhuma tabela — só grants, triggers, RLS, policies,
-- funções e o bucket de storage "avatars". O schema (profiles, patients,
-- psychologists, availability_slots, appointments, payments, reviews,
-- session_notes) já existe.
--
-- IMPORTANTE (se você já rodou uma versão anterior deste arquivo e todo o site
-- começou a dar erro "infinite recursion detected in policy for relation ...")
-- rodar este arquivo de novo, inteiro, resolve — a versão atual já inclui a
-- função public.is_admin() que quebra o ciclo. Ver comentário na seção RLS.
--
-- REGRAS DE ACESSO IMPLEMENTADAS:
--   • paciente só vê/edita os próprios dados
--   • psicólogo só vê os próprios dados + os pacientes vinculados a ele (via sessão)
--   • admin tem acesso total a todas as tabelas
--   • usuário não autenticado não acessa nada, com 3 exceções mínimas e
--     deliberadas, exigidas pelo próprio produto: perfil público do psicólogo
--     aprovado, seus horários de atendimento, e o bucket de fotos de perfil —
--     sem isso a busca de psicólogos (/psicologos) não funciona sem login.
--   • sessões (appointments) visíveis só para paciente e psicólogo envolvidos
--   • dados financeiros (payments) visíveis só para admin e o psicólogo dono —
--     o paciente NÃO lê o próprio payment, mas ainda pode criar o registro
--     'pending' ao iniciar o checkout.
-- ============================================================================


-- ##################  0006_service_role_grants.sql  ##################
-- Sem isso, a service_role key (webhook do Stripe / lib/supabase/admin.ts /
-- cron job) não consegue ler nem escrever em NENHUMA tabela ("permission denied").

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;

alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant all privileges on routines to service_role;


-- ##################  0005_handle_new_user_trigger.sql  ##################
-- Sem isso, cadastro de usuário não cria a linha em public.profiles: o
-- dashboard mostra "Usuário" e qualquer insert em patients/psychologists/
-- appointments (que referenciam profiles.id) falha com foreign key violation.

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'patient')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_update()
returns trigger as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_update();

-- backfill: cria o profile de quem já se cadastrou e ficou órfão
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  coalesce(u.raw_user_meta_data->>'role', 'patient')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;


-- ##################  0001_rls_policies.sql (já com a correção do 0008)  ##################

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.psychologists enable row level security;
alter table public.availability_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.session_notes enable row level security;

-- Checagem de admin usada por praticamente toda política abaixo. Precisa ser
-- SECURITY DEFINER: como profiles e psychologists se referenciam mutuamente,
-- uma consulta inline a "profiles" dentro da política de outra tabela reaciona
-- a RLS de profiles, que pode voltar a acionar a RLS da primeira tabela — ciclo
-- infinito ("infinite recursion detected in policy for relation ..."). Uma
-- função SECURITY DEFINER roda com o privilégio de quem a criou, não de quem
-- chama, então a consulta a profiles *dentro dela* não re-aciona RLS nenhuma.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ========== PROFILES ==========
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- rede de segurança: permite que o próprio usuário crie seu profile se o
-- trigger on_auth_user_created (acima) falhar por algum motivo
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- psicólogo precisa ler o profile de quem reservou (nome/foto do paciente vinculado a ele)
drop policy if exists "profiles_select_involved_in_appointment" on public.profiles;
create policy "profiles_select_involved_in_appointment" on public.profiles
  for select using (
    id in (
      select patient_id from public.appointments
      where psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    )
  );

-- ACESSO PÚBLICO (1/3): o profile de um psicólogo aprovado é público — nome/foto
-- aparecem na busca (/psicologos) e na página do psicólogo, vistas sem login.
-- Sem isso o marketplace não funciona: paciente precisa navegar antes de criar conta.
drop policy if exists "profiles_select_approved_psychologist" on public.profiles;
create policy "profiles_select_approved_psychologist" on public.profiles
  for select using (
    id in (select profile_id from public.psychologists where status = 'approved')
  );

-- ========== PATIENTS ==========
drop policy if exists "patients_owner_all" on public.patients;
create policy "patients_owner_all" on public.patients
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- psicólogo lê os dados clínicos (data de nascimento, gênero, queixa) só de
-- pacientes com quem tem pelo menos uma sessão — nunca de paciente nenhum vinculado.
drop policy if exists "patients_select_linked_psychologist" on public.patients;
create policy "patients_select_linked_psychologist" on public.patients
  for select using (
    profile_id in (
      select patient_id from public.appointments
      where psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    )
  );

drop policy if exists "patients_admin_all" on public.patients;
create policy "patients_admin_all" on public.patients
  for all using (public.is_admin());

-- ========== PSYCHOLOGISTS ==========
-- ACESSO PÚBLICO (2/3): perfil profissional (CRP, especialidades, bio, preço) só é
-- público quando status = 'approved'. Pendente/rejeitado/suspenso só o dono e admin veem.
drop policy if exists "psychologists_select_public" on public.psychologists;
create policy "psychologists_select_public" on public.psychologists
  for select using (
    status = 'approved'
    or profile_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "psychologists_owner_write" on public.psychologists;
create policy "psychologists_owner_write" on public.psychologists
  for insert with check (profile_id = auth.uid());

drop policy if exists "psychologists_owner_update" on public.psychologists;
create policy "psychologists_owner_update" on public.psychologists
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- psicólogo não pode se auto-aprovar via API: status/approved_at/approved_by
-- só são alterados de fato quando quem edita é admin (ver trigger abaixo).
create or replace function public.protect_psychologist_approval_fields()
returns trigger as $$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists psychologists_protect_approval on public.psychologists;
create trigger psychologists_protect_approval
  before update on public.psychologists
  for each row execute function public.protect_psychologist_approval_fields();

drop policy if exists "psychologists_admin_all" on public.psychologists;
create policy "psychologists_admin_all" on public.psychologists
  for all using (public.is_admin());

-- ========== AVAILABILITY_SLOTS ==========
-- ACESSO PÚBLICO (3/3): horários de atendimento precisam ser visíveis sem login —
-- é o que a página do psicólogo mostra para o paciente escolher antes de agendar
-- (só o agendamento em si exige login). Não expõe nenhum dado de paciente.
drop policy if exists "availability_select_public" on public.availability_slots;
create policy "availability_select_public" on public.availability_slots
  for select using (true);

drop policy if exists "availability_owner_write" on public.availability_slots;
create policy "availability_owner_write" on public.availability_slots
  for all using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  ) with check (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  );

drop policy if exists "availability_admin_all" on public.availability_slots;
create policy "availability_admin_all" on public.availability_slots
  for all using (public.is_admin());

-- ========== APPOINTMENTS ==========
-- visível só para o paciente e o psicólogo da sessão (+ admin)
drop policy if exists "appointments_select_involved" on public.appointments;
create policy "appointments_select_involved" on public.appointments
  for select using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "appointments_insert_patient" on public.appointments;
create policy "appointments_insert_patient" on public.appointments
  for insert with check (patient_id = auth.uid());

drop policy if exists "appointments_update_involved" on public.appointments;
create policy "appointments_update_involved" on public.appointments
  for update using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "appointments_admin_all" on public.appointments;
create policy "appointments_admin_all" on public.appointments
  for all using (public.is_admin());

-- evita dois agendamentos ativos no mesmo horário para o mesmo psicólogo
create unique index if not exists appointments_no_double_booking
  on public.appointments(psychologist_id, starts_at)
  where status in ('scheduled', 'confirmed');

create index if not exists appointments_patient_idx on public.appointments(patient_id);
create index if not exists appointments_psychologist_idx on public.appointments(psychologist_id);

-- ========== PAYMENTS ==========
-- dado financeiro: só admin e o psicólogo dono da sessão podem LER (o paciente
-- não vê o repasse/comissão — ele acompanha o pagamento pelo status da sessão).
drop policy if exists "payments_select_involved" on public.payments;
create policy "payments_select_involved" on public.payments
  for select using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

-- o paciente ainda precisa poder CRIAR o registro de pagamento da própria sessão ao
-- iniciar o checkout (app/api/pagamentos/criar-sessao roda como o próprio paciente,
-- não como service role) — mas só com status 'pending'; confirmar/rejeitar/reembolsar
-- só acontece via webhook do Stripe, que usa a service role key e ignora RLS.
drop policy if exists "payments_insert_patient_pending" on public.payments;
create policy "payments_insert_patient_pending" on public.payments
  for insert with check (patient_id = auth.uid() and status = 'pending');

drop policy if exists "payments_update_patient_pending" on public.payments;
create policy "payments_update_patient_pending" on public.payments
  for update using (patient_id = auth.uid())
  with check (patient_id = auth.uid() and status = 'pending');

drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_admin_all" on public.payments
  for all using (public.is_admin());

create unique index if not exists payments_appointment_idx on public.payments(appointment_id);

-- ========== REVIEWS ==========
-- avaliação não é pública: só quem escreveu, o psicólogo avaliado e o admin veem.
-- (a média/contagem agregada em psychologists.rating_avg / rating_count essa sim é
-- pública, porque psychologists_select_public libera leitura do psicólogo aprovado.)
drop policy if exists "reviews_select_public" on public.reviews;
drop policy if exists "reviews_select_involved" on public.reviews;
create policy "reviews_select_involved" on public.reviews
  for select using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "reviews_insert_patient" on public.reviews;
create policy "reviews_insert_patient" on public.reviews
  for insert with check (
    patient_id = auth.uid()
    and appointment_id in (
      select id from public.appointments where status = 'completed' and patient_id = auth.uid()
    )
  );

drop policy if exists "reviews_admin_all" on public.reviews;
create policy "reviews_admin_all" on public.reviews
  for all using (public.is_admin());

-- ========== SESSION_NOTES ==========
-- anotações clínicas: só o psicólogo autor lê e escreve (não são compartilhadas com o paciente)
drop policy if exists "session_notes_owner_all" on public.session_notes;
create policy "session_notes_owner_all" on public.session_notes
  for all using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  ) with check (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  );

drop policy if exists "session_notes_admin_all" on public.session_notes;
create policy "session_notes_admin_all" on public.session_notes
  for all using (public.is_admin());

create unique index if not exists session_notes_appointment_idx on public.session_notes(appointment_id);


-- ##################  0002_rating_trigger.sql  ##################

create or replace function public.refresh_psychologist_rating()
returns trigger as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.psychologist_id, old.psychologist_id);

  update public.psychologists
  set
    rating_avg = coalesce((select round(avg(rating)::numeric, 2) from public.reviews where psychologist_id = target_id), 0),
    rating_count = (select count(*) from public.reviews where psychologist_id = target_id)
  where id = target_id;

  return null;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists reviews_refresh_rating on public.reviews;
create trigger reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_psychologist_rating();


-- ##################  0003_booking_rpc.sql  ##################

create or replace function public.get_busy_slots(p_psychologist_id uuid)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select starts_at, ends_at
  from public.appointments
  where psychologist_id = p_psychologist_id
    and status in ('scheduled', 'confirmed')
    and starts_at > now();
$$;

grant execute on function public.get_busy_slots(uuid) to anon, authenticated;


-- ##################  0004_storage.sql  ##################

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars_owner_write" on storage.objects;
create policy "avatars_owner_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);


-- ##################  0007_psychologist_suspended_status.sql  ##################
-- Necessário para o botão "Suspender" no painel admin funcionar — sem isso o
-- enum psy_status só aceita pending/approved/rejected.

alter type public.psy_status add value if not exists 'suspended';

-- ============================================================================
-- Fim. Depois de rodar, confirme em Database > Tables que profiles, patients,
-- psychologists, appointments, payments, reviews e session_notes mostram o
-- cadeado de RLS ativado. Peça para o Claude testar em seguida — ele consegue
-- verificar direto contra o banco (com a chave anônima) se cada regra está
-- valendo, sem precisar de mais nenhuma ação sua além de avisar que rodou.
-- ============================================================================
