-- CRÍTICO: a service_role key (usada pelo webhook do Stripe e por lib/supabase/admin.ts
-- para confirmar pagamento e liberar a sessão) não tinha nenhum GRANT nas tabelas
-- do schema public. RLS "bypassa" políticas, mas não substitui os privilégios de
-- GRANT do Postgres — sem isso, todo acesso via service_role retorna
-- "permission denied for table X" (42501), mesmo em tabelas sem RLS nenhuma.
--
-- Confirmado em auditoria: profiles, patients, psychologists, appointments,
-- payments, reviews, availability_slots e session_notes estavam todas bloqueadas
-- para service_role.

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;

-- garante que tabelas criadas no futuro também já venham com o grant
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant all privileges on sequences to service_role;
alter default privileges in schema public
  grant all privileges on routines to service_role;
