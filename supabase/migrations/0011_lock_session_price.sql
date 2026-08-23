-- Achado na bateria de segurança pós-0009/0010: o preço fixo de R$ 150,00 da
-- plataforma só existia no cliente (app/psicologo/completar-perfil manda a
-- constante PRECO_SESSAO_PADRAO no insert). Nada no banco impedia um psicólogo
-- de mandar um PATCH direto na API e gravar qualquer valor em session_price —
-- confirmado no teste: consegui gravar 1.00 usando o token do próprio psicólogo.
--
-- O impacto não é roubo direto: o checkout em app/api/pagamentos/criar-sessao
-- calcula com PRECO_SESSAO_PADRAO no servidor, então a cobrança real continua
-- R$ 150,00. O problema é a vitrine — o valor da coluna é o que aparece na
-- listagem e no perfil público, então dava pra anunciar "R$ 1,00" e cobrar 150.
--
-- Mesmo padrão de status/approved_at/approved_by e de profiles.role: RLS é por
-- linha, nunca por coluna, então quem protege coluna específica é trigger.

create or replace function public.protect_session_price()
returns trigger as $$
begin
  if new.session_price is distinct from 150.00 and not public.is_admin() then
    new.session_price := 150.00;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists psychologists_lock_price on public.psychologists;
create trigger psychologists_lock_price
  before insert or update on public.psychologists
  for each row execute function public.protect_session_price();

-- Normaliza quem já esteja fora do padrão (inclui a linha usada no teste).
update public.psychologists set session_price = 150.00 where session_price is distinct from 150.00;
