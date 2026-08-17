-- Adiciona o status "suspended" ao enum psy_status, usado pelo painel admin
-- para suspender um psicólogo já aprovado (ex.: violação ética) sem
-- reclassificá-lo como "rejected" (que é para quem nunca foi aprovado).
--
-- Não precisa mexer em RLS: a policy psychologists_select_public já só
-- expõe publicamente quem está com status = 'approved', então um
-- psicólogo suspenso já some da busca automaticamente.

alter type public.psy_status add value if not exists 'suspended';
