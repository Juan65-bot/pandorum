-- Pandorum — políticas de RLS para o schema já existente no projeto.
-- Rode no SQL Editor do Supabase (Dashboard → SQL Editor) ou via `supabase db push`.
-- Idempotente: pode rodar mais de uma vez sem erro. Não cria nem altera nenhuma
-- tabela/coluna/enum — o schema (appointments, payments, reviews, patients,
-- psychologists, profiles, availability_slots, session_notes) já existe no projeto.
--
-- Regras de acesso implementadas:
--   • paciente só vê/edita os próprios dados
--   • psicólogo só vê os próprios dados + os pacientes vinculados a ele (via sessão)
--   • admin tem acesso total a todas as tabelas
--   • usuário não autenticado não acessa nada, com duas exceções deliberadas e
--     mínimas, exigidas pelo próprio produto (ver nota "ACESSO PÚBLICO" abaixo)
--   • sessões visíveis só para paciente e psicólogo envolvidos (+ admin)
--   • dados financeiros (payments) visíveis só para admin e o psicólogo dono

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.psychologists enable row level security;
alter table public.availability_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.session_notes enable row level security;

-- Checagem de admin usada por praticamente toda política abaixo. Precisa ser
-- SECURITY DEFINER: como profiles e psychologists se referenciam mutuamente
-- (profiles precisa saber se alguém é psicólogo aprovado; psychologists precisa
-- saber se quem está lendo é admin, o que envolve olhar profiles), uma consulta
-- inline a "profiles" dentro da política de outra tabela reaciona a RLS de
-- profiles, que pode voltar a acionar a RLS da primeira tabela — ciclo infinito
-- ("infinite recursion detected in policy for relation ..."). Uma função
-- SECURITY DEFINER roda com o privilégio de quem a criou, não de quem chama,
-- então a consulta a profiles *dentro dela* não re-aciona RLS nenhuma, e o
-- ciclo nunca se forma.
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
-- trigger on_auth_user_created (0005) falhar por algum motivo
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- RLS restringe QUAL LINHA pode ser editada (a própria), nunca QUAIS COLUNAS —
-- sem isso, qualquer um poderia trocar o próprio role para 'admin' via
-- profiles_update_own, já que "id = auth.uid()" continua valendo depois da troca.
create or replace function public.protect_profile_role()
returns trigger as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists profiles_protect_role on public.profiles;
create trigger profiles_protect_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

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
