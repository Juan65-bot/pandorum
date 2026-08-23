# Verificação de identidade do psicólogo

Como funciona o fluxo que impede alguém de se cadastrar como psicólogo com um CRP inventado.

## Ordem de aplicação das migrations

> ⚠️ **`0012` e `0013` precisam rodar em execuções separadas, nessa ordem.**
> O Postgres não deixa usar um valor de enum na mesma transação em que ele foi
> criado. Rodar as duas juntas dá `unsafe use of new value of enum type`.

```
0012_verification_status_enum.sql     ← roda sozinha primeiro
0013_psychologist_verification.sql    ← depois
```

A `0013` é idempotente e pode ser reexecutada. Ela também **substitui** o trigger
`protect_psychologist_approval_fields` criado na `0001`.

## Estados do cadastro

| Status | Significado | Aparece na busca? |
|---|---|---|
| `pending_documents` | Criou a conta, ainda não enviou os 5 documentos | Não |
| `pending_review` | Documentos completos, na fila do admin | Não |
| `approved` | Verificado — CRP conferido no CFP | **Sim** |
| `rejected` | Reprovado, com motivo obrigatório | Não |
| `suspended` | Suspenso depois de aprovado | Não |

`pending` é legado: continua no enum (não dá para remover valor de enum), mas a
`0013` migra todas as linhas para `pending_documents` e troca o default.

## Quem pode mudar o quê

Três camadas, todas no banco — não dá para contornar pela API:

1. **`protect_psychologist_approval_fields`** (trigger em `psychologists`)
   Reverte silenciosamente qualquer alteração de `status`, `approved_at`,
   `approved_by`, `reviewed_at`, `reviewed_by`, `rejection_reason` e
   `additional_document_request` feita por quem não é admin.

   A única exceção é a transição `pending_documents → pending_review`, e mesmo
   ela só passa quando: quem edita é o dono do cadastro **e**
   `documentos_completos(id)` confirma os 5 documentos no banco.

   Depois que o cadastro sai de `pending_documents`/`rejected`, os campos de
   identidade (`crp_number`, `cpf`, `full_name_document`, `birth_date`,
   `crp_region`, `crp_state`) também congelam — isso fecha a fraude de ser
   aprovado com o CRP verdadeiro e trocar o número depois.

2. **`appointments_require_approved_psychologist`** (trigger em `appointments`)
   Recusa o insert se o psicólogo não estiver `approved`. Esconder da busca não
   é o mesmo que impedir: com o id em mãos, um insert direto na API passaria.

3. **RLS** — `psychologists_select_public` só expõe publicamente `status = 'approved'`.

## Documentos

Ficam no bucket **privado** `verification-documents`, caminho `{profile_id}/{doc_type}.{ext}`.

- Não existe URL pública. O acesso é sempre por URL assinada de 5 minutos,
  emitida em `/api/verificacao/documento-url`.
- A policy `verification_docs_owner_read` autoriza **só** o dono do arquivo e o
  admin. Paciente e outros psicólogos não leem nada.
- A rota de assinatura não faz autorização própria de propósito: ela repassa a
  sessão do usuário para o Storage, então existe uma única fonte de verdade.

Os 5 obrigatórios: carteira do CRP (frente), documento oficial (frente e verso),
selfie com o documento, diploma de graduação.

## Auditoria

`verification_audit_log` é **imutável**: além de não ter policy de update/delete,
o trigger `verification_audit_log_immutable` levanta exceção em qualquer tentativa
— inclusive vinda da `service_role`, que ignora RLS.

Cada decisão grava quem decidiu, quando, o status anterior e o novo, o motivo e —
nas aprovações — o checklist exato que o admin marcou.

## Por onde passa cada ação

Toda decisão de verificação vai por `POST /api/admin/verificacoes`, nunca por
update direto do browser, porque três coisas precisam acontecer juntas: mudança
de status, registro na auditoria e e-mail ao psicólogo. Isso vale também para
suspender/reativar em `/admin/psicologos`.

Aprovar **não** existe na tela de listagem de psicólogos de propósito: exige o
checklist e a conferência dos documentos, que só existem em `/admin/verificacoes`.

## Conferência no CFP

O botão na tela de análise abre o Cadastro Nacional de Psicólogos já filtrado
pelo número informado (`urlConsultaCFP` em `lib/types.ts`). A conferência é
humana — nenhuma API pública do CFP é consumida.
