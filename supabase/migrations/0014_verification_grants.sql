-- Correção da 0013, encontrada nos testes logo depois de aplicá-la: as duas
-- tabelas novas foram criadas com grant só para service_role, então qualquer
-- requisição de usuário logado levava 42501 ("permission denied for table
-- psychologist_documents") antes mesmo de a RLS ser avaliada.
--
-- Na prática isso quebrava a feature inteira pelo lado do psicólogo: ele não
-- conseguia registrar nem listar os próprios documentos. Também não é uma
-- proteção real — só uma porta trancada antes da porta certa. Quem decide QUAIS
-- linhas cada um enxerga são as policies psy_docs_owner_all / psy_docs_admin_all
-- e audit_log_select_own / audit_log_admin_all, que já estavam corretas.
--
-- Causa: tabela criada por SQL puro não herda os grants que o Supabase aplica
-- automaticamente às tabelas criadas pelo dashboard. As tabelas antigas do
-- projeto (psychologists, profiles, ...) têm DML concedido a anon e
-- authenticated justamente por terem nascido pelo dashboard.
--
-- A 0013 já foi corrigida para incluir isso; esta migration existe para o banco
-- onde a 0013 rodou na versão anterior. Idempotente.

grant select, insert, update, delete on public.psychologist_documents to authenticated;

-- sem update/delete: a auditoria é imutável
grant select, insert on public.verification_audit_log to authenticated;

-- anon continua sem nada nas duas: documento de identidade e log de aprovação
-- não têm leitura pública nenhuma.
