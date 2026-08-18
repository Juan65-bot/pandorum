# Pandorum

Plataforma de atendimento psicológico online: pacientes encontram e agendam sessões com psicólogos verificados, pagam via PIX ou cartão e realizam a sessão por videochamada dentro da própria plataforma.

## Stack

- [Next.js 16](https://nextjs.org) (App Router, Turbopack)
- [Supabase](https://supabase.com) — Postgres, Auth, Storage, Realtime
- [Stripe](https://stripe.com) — pagamentos (PIX e cartão)
- Tailwind CSS 4, React Hook Form + Zod, FullCalendar, WebRTC nativo

## Configuração

1. Instale as dependências:

```bash
npm install
```

2. Preencha o `.env.local` (veja `.env.local` na raiz do projeto):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — já configurados, vêm do projeto Supabase.
- `STRIPE_SECRET_KEY` — chave secreta da sua conta Stripe (Developers → API keys).
- `STRIPE_WEBHOOK_SECRET` — gerada ao criar o endpoint de webhook (veja abaixo).
- `NEXT_PUBLIC_SITE_URL` — URL pública do site (`http://localhost:3000` em dev).
- `CRON_SECRET` — já gerado em `.env.local`; copie o mesmo valor para a Vercel (Settings → Environment Variables), senão o cron job de completar sessões falha em produção.
- `SESSION_NOTES_ENCRYPTION_KEY` — já gerado em `.env.local`; copie também para a Vercel. É a chave que criptografa as notas clínicas — se ela mudar, notas antigas ficam ilegíveis.

3. Rode as migrations no Supabase: cole o conteúdo de `supabase/APLICAR_NO_SQL_EDITOR.sql` no SQL Editor do Dashboard e execute (ou rode os arquivos de `supabase/migrations/` em ordem, ou via `supabase db push` com o CLI logado e o projeto linkado). Elas criam o trigger que preenche `profiles` no cadastro, os grants da `service_role`, políticas de RLS, funções e índices — nenhuma tabela nova é criada, pois o schema (`profiles`, `patients`, `psychologists`, `availability_slots`, `appointments`, `payments`, `reviews`, `session_notes`) já existe no projeto Supabase. **Sem rodar isso, cadastro de usuário fica quebrado** (ver "Pontos de atenção" abaixo).

4. Configure o webhook do Stripe apontando para `https://SEU_DOMINIO/api/pagamentos/webhook`, assinando os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`. Em desenvolvimento, use `stripe listen --forward-to localhost:3000/api/pagamentos/webhook`.

4b. O cron job que marca sessões como concluídas (`vercel.json`, roda `/api/cron/completar-sessoes` a cada hora) só é ativado automaticamente quando o projeto está deployado na Vercel — não precisa configurar nada além de garantir que `CRON_SECRET` esteja definido lá. No plano Hobby a Vercel pode limitar a frequência real de execução.

5. Rode o servidor de desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Estrutura

```
app/
  auth/            login, cadastro, esqueci/redefinir senha, callback de confirmação
  dashboard/        painel inicial (conteúdo varia por papel: paciente/psicólogo/admin)
  perfil/           perfil do paciente
  psicologo/completar-perfil/   perfil profissional do psicólogo (CRP, especialidades, horários)
  psicologos/       busca pública + página de cada psicólogo com agendamento
  sessoes/          lista de sessões, pagamento e sala de videochamada
  admin/            painel administrativo (métricas, psicólogos, pacientes, sessões, financeiro)
  api/pagamentos/   checkout e webhook do Stripe
  api/notas-sessao/ lê/grava notas clínicas — só aqui elas são (des)criptografadas
  api/cron/         rota chamada pelo Vercel Cron (vercel.json) pra fechar sessões passadas
components/        Header, AvailabilityManager, BookingCalendar, RescheduleCalendar, SessionCard, VideoRoom, admin/, etc.
lib/                clientes Supabase, hooks, validação (zod), regras de agendamento, lib/crypto.ts
supabase/migrations/  políticas de RLS, triggers e funções (não recria tabelas)
```

## Papéis de usuário

- **Paciente**: busca psicólogos, agenda e paga sessões, avalia sessões concluídas.
- **Psicólogo**: completa perfil profissional, define horários de atendimento, atende sessões, escreve notas clínicas privadas.
- **Admin**: aprova/rejeita cadastros de psicólogos (verificação de CRP), acompanha métricas da plataforma.

## Videochamada

A sala de sessão usa WebRTC ponto-a-ponto, com sinalização via Supabase Realtime (sem custo de serviço externo). Usa apenas servidores STUN públicos — não há servidor TURN, então conexões atrás de NAT muito restritivo podem falhar. Para produção com volume real, considere adicionar um TURN (ex.: Twilio, Cloudflare Calls) ou migrar para um provedor de vídeo gerenciado.

## Pontos de atenção antes de produção

- **Rode `supabase/APLICAR_NO_SQL_EDITOR.sql` por completo.** Uma auditoria de segurança encontrou o script parcialmente aplicado no banco (RLS ativo em `appointments`/`payments`/`availability_slots`, mas não em `profiles`/`psychologists` — nesse estado, qualquer usuário autenticado consegue ler o e-mail de todo mundo e reescrever o perfil de outro psicólogo). O script inteiro é idempotente, então rodá-lo de novo não quebra o que já está correto.
- A comissão da plataforma (30%, conforme o contrato aceito pelo psicólogo em `/psicologo/termos`) está fixa em `lib/stripe.ts` (`TAXA_PLATAFORMA`) — se o valor mudar, atualize os dois lugares juntos.
- O contrato em `/psicologo/termos` é um texto padrão gerado para o produto — recomendamos revisão por um advogado antes de valer como termo vinculante em produção.
- Não há repasse automático (payout) para os psicólogos via Stripe Connect — os campos `psy_payout`/`platform_fee` são calculados e registrados, mas o repasse em si precisa ser implementado (Stripe Connect, que exige onboarding do próprio psicólogo, ou processo manual).
- Notificações por e-mail (confirmação de sessão, lembrete) ainda não existem — precisam de um serviço de envio (ex.: Resend) configurado.
- A videochamada usa só STUN público (sem TURN) — pode falhar em redes com NAT muito restritivo.
