-- CRÍTICO: não existia nenhum trigger criando a linha em public.profiles
-- quando um usuário se cadastra em auth.users. Resultado: todo cadastro novo
-- ficava com "profiles" vazio, o dashboard mostrava "Usuário" em vez do nome,
-- e qualquer insert em patients/psychologists/appointments (que referenciam
-- profiles.id) falhava com "violates foreign key constraint" (409).
--
-- Confirmado em auditoria: as contas juanpabloalvessouza18@gmail.com (dono do
-- projeto) e qualquer cadastro feito depois de maio/2026 não tinham profile.

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

-- também mantém o e-mail em profiles sincronizado se o usuário trocar de e-mail
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

-- backfill: cria o profile de qualquer usuário já cadastrado que ficou órfão
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
