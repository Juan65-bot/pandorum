-- Pandorum — políticas de RLS para o schema já existente no projeto.
-- Rode no SQL Editor do Supabase (Dashboard → SQL Editor) ou via `supabase db push`.
-- Idempotente: pode rodar mais de uma vez sem erro. Não cria nem altera nenhuma
-- tabela/coluna/enum — o schema (appointments, payments, reviews, patients,
-- psychologists, profiles, availability_slots, session_notes) já existe no projeto.

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

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

-- psicólogos precisam ler o profile de quem reservou (nome do paciente nas sessões)
drop policy if exists "profiles_select_involved_in_appointment" on public.profiles;
create policy "profiles_select_involved_in_appointment" on public.profiles
  for select using (
    id in (
      select patient_id from public.appointments
      where psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    )
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
-- perfis aprovados são públicos; pendentes/rejeitados só o dono e admin veem
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

-- psicólogo não pode se auto-aprovar via API: status/approved_at/approved_by
-- só são alterados de fato quando quem edita é admin (ver trigger abaixo).
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

-- evita dois agendamentos ativos no mesmo horário para o mesmo psicólogo
create unique index if not exists appointments_no_double_booking
  on public.appointments(psychologist_id, starts_at)
  where status in ('scheduled', 'confirmed');

create index if not exists appointments_patient_idx on public.appointments(patient_id);
create index if not exists appointments_psychologist_idx on public.appointments(psychologist_id);

-- ========== PAYMENTS ==========
-- escrita feita pelo backend com a service role key (checkout + webhook do Stripe)
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
  for all using (
    exists (select 1 from public.profiles me where me.id = auth.uid() and me.role = 'admin')
  );

create unique index if not exists session_notes_appointment_idx on public.session_notes(appointment_id);
