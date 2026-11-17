-- Guarda a chave de API da subconta do psicólogo, necessária para o dashboard
-- financeiro dele.
--
-- Por que é preciso: no Asaas a conta-mãe NÃO enxerga o saldo das subcontas.
-- GET /finance/balance responde sobre a conta dona da chave usada na chamada,
-- então mostrar "saldo disponível para saque" exige a chave da subconta dele.
-- Ela é devolvida uma única vez, no POST /v3/accounts que a cria — se não for
-- guardada naquele momento, não há como recuperá-la depois pela API.
--
-- Em tabela separada, e não como coluna de psychologists, de propósito. A
-- alternativa seria uma coluna com `revoke select (coluna)`, mas várias telas
-- fazem `select('*')` em psychologists: é exatamente assim que uma coluna nova
-- vaza para o browser sem ninguém perceber — ninguém escreveu o nome dela em
-- lugar nenhum, ela veio junto. Tabela à parte, sem grant nenhum para anon e
-- authenticated, não tem como ser incluída por engano.

create table if not exists public.psychologist_asaas_credentials (
  psychologist_id uuid primary key references public.psychologists(id) on delete cascade,
  -- AES-256-GCM (lib/crypto.ts), mesma mecânica das notas clínicas. É uma
  -- credencial que movimenta dinheiro de terceiro: com ela dá para consultar
  -- saldo, emitir cobrança e sacar em nome do psicólogo. Um vazamento de banco
  -- não pode entregar isso em texto puro.
  api_key_encrypted text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.psychologist_asaas_credentials enable row level security;

-- Nenhuma policy para usuário nenhum, nem para o dono. Quem lê é só a
-- service_role, de dentro de rota de servidor — e a service_role ignora RLS.
-- Nem o próprio psicólogo precisa ver a chave: ele vê o saldo, não a credencial.
drop policy if exists "asaas_cred_admin_all" on public.psychologist_asaas_credentials;
create policy "asaas_cred_admin_all" on public.psychologist_asaas_credentials
  for all using (public.is_admin());

grant all privileges on public.psychologist_asaas_credentials to service_role;
-- anon e authenticated ficam sem grant algum, de propósito.
