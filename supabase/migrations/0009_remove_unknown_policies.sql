-- Achado durante a bateria de testes pós-0008: e-mail de TODO usuário com
-- role = 'psychologist' estava visível pra requisições totalmente anônimas,
-- mesmo sem nenhum registro aprovado em psychologists (ex.: alguém que só
-- terminou o cadastro mas nunca completou o perfil profissional). Isso não
-- vem de nenhuma policy que eu escrevi (as minhas checam status='approved'
-- na tabela psychologists, não profiles.role diretamente) — é sobra de uma
-- policy criada por fora (provavelmente pelo botão de correção automática
-- do Supabase Security Advisor, antes da auditoria completa), com um nome
-- que eu não conheço, então "drop policy if exists <meu nome>" nunca a pegou.
--
-- Em vez de adivinhar o nome, isso aqui varre pg_policies e remove qualquer
-- policy nas 8 tabelas da plataforma que não seja uma das que a Pandorum
-- realmente usa — sobra nenhuma, seja qual for o nome ou origem dela.

do $$
declare
  pol record;
  policies_conhecidas text[] := array[
    'profiles_select_own', 'profiles_update_own', 'profiles_insert_own', 'profiles_admin_all',
    'profiles_select_involved_in_appointment', 'profiles_select_approved_psychologist',
    'patients_owner_all', 'patients_select_linked_psychologist', 'patients_admin_all',
    'psychologists_select_public', 'psychologists_owner_write', 'psychologists_owner_update', 'psychologists_admin_all',
    'availability_select_public', 'availability_owner_write', 'availability_admin_all',
    'appointments_select_involved', 'appointments_insert_patient', 'appointments_update_involved', 'appointments_admin_all',
    'payments_select_involved', 'payments_insert_patient_pending', 'payments_update_patient_pending', 'payments_admin_all',
    'reviews_select_involved', 'reviews_insert_patient', 'reviews_admin_all',
    'session_notes_owner_all', 'session_notes_admin_all'
  ];
begin
  for pol in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'patients', 'psychologists', 'availability_slots',
        'appointments', 'payments', 'reviews', 'session_notes'
      )
      and policyname <> all (policies_conhecidas)
  loop
    execute format('drop policy %I on %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    raise notice 'Removida policy desconhecida "%" em %.%', pol.policyname, pol.schemaname, pol.tablename;
  end loop;
end $$;
