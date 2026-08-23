-- Verificação de identidade do psicólogo — PARTE 1 de 2: só os valores do enum.
--
-- IMPORTANTE: esse arquivo tem que rodar SOZINHO, antes da 0013. O Postgres
-- não deixa usar um valor de enum recém-criado na mesma transação em que ele
-- foi adicionado ("unsafe use of new value of enum type"). Como a 0013 precisa
-- gravar 'pending_documents' nas linhas existentes, os dois passos não cabem
-- juntos.
--
-- O valor legado 'pending' continua no enum porque o Postgres não permite
-- remover valor de enum. Ele deixa de ser usado: a 0013 migra todas as linhas
-- para 'pending_documents' e troca o default da coluna. Nada no código novo
-- escreve 'pending'.

alter type public.psy_status add value if not exists 'pending_documents';
alter type public.psy_status add value if not exists 'pending_review';
