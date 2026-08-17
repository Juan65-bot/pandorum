-- ============================================================================
-- PANDORUM — script único para colar no SQL Editor do Supabase e rodar de uma vez
-- (https://supabase.com/dashboard/project/inutvjfdcuphazpgtdor/sql/new)
--
-- Equivale a rodar, em ordem, os 7 arquivos de supabase/migrations/.
-- 100% idempotente: pode rodar de novo sem quebrar nada.
-- NÃO cria nem apaga nenhuma tabela — só grants, trigger de cadastro, RLS,
-- policies, funções e o bucket de storage "avatars". O schema (profiles,
-- patients, psychologists, availability_slots, appointments, payments,
-- reviews, session_notes) já existe.
--
-- OS DOIS PRIMEIROS BLOCOS (grants + trigger de cadastro) SÃO CRÍTICOS:
-- sem eles, cadastro de usuário fica com o "profiles" vazio e qualquer
-- ação (completar perfil, agendar sessão, confirmar pagamento) falha.
-- ============================================================================


-- ##################  0006_service_role_grants.sql  ##################
-- Sem isso, a service_role key (webhook do Stripe / lib/supabase/admin.ts)
-- não consegue ler nem escrever em NENHUMA tabela ("permission denied").

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
-- (isso inclui a conta do dono do projeto, juanpabloalvessouza18@gmail.com)
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


-- ##################  0001_rls_policies.sql  ##################

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.psychologists enable row level security;
alter table public.availability_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.session_notes enable row level security;

-- ========== PROFILES ==========
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid());

-- rede de segurança: permite que o próprio usuário crie seu profile se o
-- trigger on_auth_user_created falhar por algum motivo
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

drop policy if exists "profiles_select_involved_in_appointment" on public.profiles;
create policy "profiles_select_involved_in_appointment" on public.profiles
  for select using (
    id in (
      select patient_id from public.appointments
      where psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    )
  );

drop policy if exists "profiles_select_approved_psychologist" on public.profiles;
create policy "profiles_select_approved_psychologist" on public.profiles
  for select using (
    id in (select profile_id from public.psychologists where status = 'approved')
  );

-- ========== PATIENTS ==========
drop policy if exists "patients_owner_all" on public.patients;
create policy "patients_owner_all" on public.patients
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists "patients_admin_all" on public.patients;
create policy "patients_admin_all" on public.patients
  for all using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

-- ========== PSYCHOLOGISTS ==========
drop policy if exists "psychologists_select_public" on public.psychologists;
create policy "psychologists_select_public" on public.psychologists
  for select using (
    status = 'approved'
    or profile_id = auth.uid()
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

drop policy if exists "psychologists_owner_write" on public.psychologists;
create policy "psychologists_owner_write" on public.psychologists
  for insert with check (profile_id = auth.uid());

drop policy if exists "psychologists_owner_update" on public.psychologists;
create policy "psychologists_owner_update" on public.psychologists
  for update using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create or replace function public.protect_psychologist_approval_fields()
returns trigger as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
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
  for all using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

-- ========== AVAILABILITY_SLOTS ==========
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

-- ========== APPOINTMENTS ==========
drop policy if exists "appointments_select_involved" on public.appointments;
create policy "appointments_select_involved" on public.appointments
  for select using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

drop policy if exists "appointments_insert_patient" on public.appointments;
create policy "appointments_insert_patient" on public.appointments
  for insert with check (patient_id = auth.uid());

drop policy if exists "appointments_update_involved" on public.appointments;
create policy "appointments_update_involved" on public.appointments
  for update using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

create unique index if not exists appointments_no_double_booking
  on public.appointments(psychologist_id, starts_at)
  where status in ('scheduled', 'confirmed');

create index if not exists appointments_patient_idx on public.appointments(patient_id);
create index if not exists appointments_psychologist_idx on public.appointments(psychologist_id);

-- ========== PAYMENTS ==========
drop policy if exists "payments_select_involved" on public.payments;
create policy "payments_select_involved" on public.payments
  for select using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

create unique index if not exists payments_appointment_idx on public.payments(appointment_id);

-- ========== REVIEWS ==========
drop policy if exists "reviews_select_public" on public.reviews;
create policy "reviews_select_public" on public.reviews
  for select using (true);

drop policy if exists "reviews_insert_patient" on public.reviews;
create policy "reviews_insert_patient" on public.reviews
  for insert with check (
    patient_id = auth.uid()
    and appointment_id in (
      select id from public.appointments where status = 'completed' and patient_id = auth.uid()
    )
  );

-- ========== SESSION_NOTES ==========
drop policy if exists "session_notes_owner_all" on public.session_notes;
create policy "session_notes_owner_all" on public.session_notes
  for all using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  ) with check (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
  );

drop policy if exists "session_notes_admin_all" on public.session_notes;
create policy "session_notes_admin_all" on public.session_notes
  for all using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

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
-- cadeado de RLS ativado, e que seu próprio usuário (e o paciente de teste)
-- agora aparecem em Table Editor > profiles.
-- ============================================================================
