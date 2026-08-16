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

3. Rode as migrations no Supabase (SQL Editor do Dashboard, na ordem dos arquivos em `supabase/migrations/`, ou via `supabase db push` com o CLI logado e o projeto linkado). Elas só criam políticas de RLS, funções e índices — nenhuma tabela é criada, pois o schema (`profiles`, `patients`, `psychologists`, `availability_slots`, `appointments`, `payments`, `reviews`, `session_notes`) já existe no projeto Supabase.

4. Configure o webhook do Stripe apontando para `https://SEU_DOMINIO/api/pagamentos/webhook`, assinando os eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` e `checkout.session.expired`. Em desenvolvimento, use `stripe listen --forward-to localhost:3000/api/pagamentos/webhook`.

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
  admin/            verificação de psicólogos e visão geral da plataforma
  api/pagamentos/   checkout e webhook do Stripe
components/        Header, AvailabilityManager, BookingCalendar, SessionCard, VideoRoom, etc.
lib/                clientes Supabase, hooks, validação (zod), regras de agendamento
supabase/migrations/  políticas de RLS, triggers e funções (não recria tabelas)
```

## Papéis de usuário

- **Paciente**: busca psicólogos, agenda e paga sessões, avalia sessões concluídas.
- **Psicólogo**: completa perfil profissional, define horários de atendimento, atende sessões, escreve notas clínicas privadas.
- **Admin**: aprova/rejeita cadastros de psicólogos (verificação de CRP), acompanha métricas da plataforma.

## Videochamada

A sala de sessão usa WebRTC ponto-a-ponto, com sinalização via Supabase Realtime (sem custo de serviço externo). Usa apenas servidores STUN públicos — não há servidor TURN, então conexões atrás de NAT muito restritivo podem falhar. Para produção com volume real, considere adicionar um TURN (ex.: Twilio, Cloudflare Calls) ou migrar para um provedor de vídeo gerenciado.

## Pontos de atenção antes de produção

- `session_notes.content_encrypted` guarda hoje texto simples — o nome da coluna indica que as anotações clínicas deveriam ser criptografadas em repouso. Implemente criptografia (ex.: `pgsodium`/`pgcrypto` com gestão de chave adequada) antes de armazenar dados clínicos reais.
- A comissão da plataforma (15%) está fixa em `lib/stripe.ts` (`TAXA_PLATAFORMA`) — ajuste conforme o modelo de negócio.
- Não há repasse automático (payout) para os psicólogos via Stripe Connect — os campos `psy_payout`/`platform_fee` são calculados e registrados, mas o repasse em si precisa ser implementado (Stripe Connect ou processo manual).
