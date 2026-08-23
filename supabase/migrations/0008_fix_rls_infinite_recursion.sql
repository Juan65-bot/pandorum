-- CRÍTICO — CORRIGE UMA QUEDA TOTAL DA PLATAFORMA CAUSADA PELO 0001.
--
-- Ao rodar o RLS completo, toda leitura em qualquer tabela passou a falhar com
-- "infinite recursion detected in policy for relation ...". Causa: as políticas
-- de "admin" em psychologists (e em appointments/payments/etc.) checam admin
-- consultando profiles diretamente ("exists (select 1 from profiles ...)"), e
-- as políticas de profiles, por sua vez, consultam psychologists (pra saber se
-- alguém é psicólogo aprovado, ou paciente vinculado). Isso forma um ciclo:
-- psychologists → profiles → psychologists → profiles → ... infinito.
--
-- Correção: criar uma função SECURITY DEFINER pra checar admin. Uma função assim
-- roda com privilégio do dono da função (não do usuário chamando), então a
-- consulta a profiles *dentro dela* não aciona a RLS de profiles de novo — quebra
-- o ciclo. Troca toda checagem inline de admin nas políticas por essa função.

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
drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (public.is_admin());

-- ========== PATIENTS ==========
drop policy if exists "patients_admin_all" on public.patients;
create policy "patients_admin_all" on public.patients
  for all using (public.is_admin());

-- ========== PSYCHOLOGISTS ==========
drop policy if exists "psychologists_select_public" on public.psychologists;
create policy "psychologists_select_public" on public.psychologists
  for select using (
    status = 'approved'
    or profile_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "psychologists_admin_all" on public.psychologists;
create policy "psychologists_admin_all" on public.psychologists
  for all using (public.is_admin());

-- ========== AVAILABILITY_SLOTS ==========
drop policy if exists "availability_admin_all" on public.availability_slots;
create policy "availability_admin_all" on public.availability_slots
  for all using (public.is_admin());

-- ========== APPOINTMENTS ==========
drop policy if exists "appointments_select_involved" on public.appointments;
create policy "appointments_select_involved" on public.appointments
  for select using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

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

-- ========== PAYMENTS ==========
drop policy if exists "payments_select_involved" on public.payments;
create policy "payments_select_involved" on public.payments
  for select using (
    psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "payments_admin_all" on public.payments;
create policy "payments_admin_all" on public.payments
  for all using (public.is_admin());

-- ========== REVIEWS ==========
drop policy if exists "reviews_select_involved" on public.reviews;
create policy "reviews_select_involved" on public.reviews
  for select using (
    patient_id = auth.uid()
    or psychologist_id in (select id from public.psychologists where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "reviews_admin_all" on public.reviews;
create policy "reviews_admin_all" on public.reviews
  for all using (public.is_admin());

-- ========== SESSION_NOTES ==========
drop policy if exists "session_notes_admin_all" on public.session_notes;
create policy "session_notes_admin_all" on public.session_notes
  for all using (public.is_admin());
