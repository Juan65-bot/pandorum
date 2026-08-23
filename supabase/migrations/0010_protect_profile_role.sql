-- CRÍTICO — encontrado na bateria de testes pós-0008/0009: qualquer usuário
-- conseguia virar admin sozinho. Causa: "profiles_update_own" (RLS) só
-- restringe QUAL LINHA pode ser editada (a própria), nunca QUAIS COLUNAS —
-- RLS opera por linha, não por coluna. Como a condição "id = auth.uid()"
-- continua verdadeira depois de trocar o próprio role, a policy nunca bloqueia
-- essa troca. É o mesmo tipo de lacuna que status/approved_at/approved_by já
-- tinham em psychologists antes de ganharem o trigger protetor — profiles.role
-- nunca ganhou o equivalente. Corrige isso agora, no mesmo padrão.

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
