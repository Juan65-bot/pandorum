# Asaas: da sandbox para produção

O que precisa mudar quando o CNPJ sair e as chaves de produção chegarem.

## O bloqueio que não é técnico

Pelas **Resoluções Conjuntas 16 e 17 do Banco Central**, só conta **pessoa jurídica**
pode criar subcontas no Asaas. Como o split depende de subconta, e cada psicólogo
precisa da sua para receber, a integração real **só funciona depois do CNPJ**.

Na sandbox isso não bloqueia nada: subcontas são criadas normalmente e dá para
desenvolver e testar o fluxo inteiro. O código não muda por causa disso — o que
muda é só a chave.

## Checklist da virada

### 1. Variáveis de ambiente

| Variável | Sandbox | Produção |
|---|---|---|
| `ASAAS_API_KEY` | chave da conta sandbox | chave da conta PJ real |
| `ASAAS_API_URL` | `https://api-sandbox.asaas.com/v3` | `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | o mesmo token serve | **gere um novo** |
| `ASAAS_VALIDAR_IP` | `false` | `true` |

Trocar nos dois lugares: `.env.local` e Vercel → Settings → Environment Variables.

`asaasEmProducao()` em `lib/asaas.ts` deriva o ambiente da URL, e o default da
`ASAAS_API_URL` é a sandbox — esquecer de definir a variável nunca significa
cobrar de verdade por acidente.

**Gere um token de webhook novo para produção.** O da sandbox passou por
`.env.local`, por log e possivelmente por prints; um token de produção não deve
ter esse histórico. Ele é o que impede alguém de forjar "pagamento confirmado".

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

### 2. Ligar a whitelist de IP

`ASAAS_VALIDAR_IP=true` só em produção. Os IPs oficiais já estão em
`app/api/pagamentos/webhook/route.ts`:

```
52.67.12.206   18.230.8.159   54.94.136.112   54.94.183.101
```

Fica desligada na sandbox de propósito: a própria documentação do Asaas avisa
que o ambiente de testes pode enviar de IPs fora dessa lista, e ligar durante o
desenvolvimento faria todo webhook de teste ser recusado com 403.

Se o Asaas publicar IPs novos, dá para complementar sem alterar código via
`ASAAS_IPS_EXTRAS` (lista separada por vírgula). Vale conferir a
[lista oficial](https://docs.asaas.com/docs/ips-oficiais-do-asaas) antes da virada.

### 3. Cadastrar o webhook na conta de produção

Painel do Asaas → Integrações → Webhooks:

- **URL**: `https://pandorum.vercel.app/api/pagamentos/webhook`
- **Token**: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
- **Eventos**: `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`, `PAYMENT_OVERDUE`,
  `PAYMENT_DELETED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`

A rota responde `200` para qualquer evento que não trate. Isso é proposital: o
Asaas reenfileira tudo que não recebe 200, e um `4xx` em evento irrelevante
travaria a fila inteira, segurando também os eventos que importam.

### 4. As subcontas não migram

Subconta criada na sandbox **não existe em produção**. Todo psicólogo já
aprovado terá `asaas_wallet_id` apontando para uma carteira inexistente.

Antes de abrir para usuários reais:

```sql
-- confere quem está com carteira de sandbox
select id, crp_number, asaas_wallet_id from public.psychologists
where asaas_wallet_id is not null;

-- limpa para que a subconta seja recriada na aprovação
update public.psychologists
   set asaas_wallet_id = null, asaas_account_id = null, asaas_account_error = null
 where asaas_wallet_id is not null;
```

Depois disso, reaprovar cada psicólogo em `/admin/verificacoes` recria a
subconta contra a conta PJ real. A rota de cobrança recusa agendamento com quem
não tem `asaas_wallet_id`, então nenhum paciente consegue pagar no vazio nesse
intervalo.

### 5. Conferir a taxa do cartão

O repasse ao psicólogo é fixo em **R$ 100,00**, então **toda taxa do gateway sai
da parte da plataforma** (R$ 50,00 por sessão).

- **PIX**: R$ 1,99 fixos → sobram R$ 48,01
- **Cartão**: percentual + fixo, conforme o contrato negociado

Confirme o percentual real do cartão no seu contrato antes de assumir margem.
Se a taxa de cartão passar de R$ 50,00, a plataforma **perde dinheiro** naquela
sessão. Se isso acontecer, as saídas são desabilitar cartão (`billingType: 'PIX'`
em `criarCobrancaSessao`) ou renegociar `REPASSE_PSICOLOGO_SESSAO` em
`lib/types.ts` — e nesse caso o contrato do psicólogo muda junto, com novo
`VERSAO_TERMOS`.

### 6. Testes antes de liberar

- [ ] Aprovar um psicólogo e confirmar que `asaas_wallet_id` foi preenchido
- [ ] Agendar, pagar por PIX, e ver a sessão virar `confirmed`
- [ ] Confirmar que o split creditou R$ 100 na subconta
- [ ] Deixar uma cobrança vencer e ver o horário ser liberado sozinho
- [ ] Cancelar com mais de 24h e confirmar que **nada** foi cobrado
- [ ] Cancelar com menos de 24h e conferir a cobrança de R$ 75

## Decisões que já estão no código

**Split por `fixedValue`, nunca `percentualValue`.** No Asaas o percentual incide
sobre o valor já descontado das taxas, e como a taxa do PIX e a do cartão são
diferentes, o mesmo percentual entregaria valores distintos ao psicólogo conforme
o meio de pagamento — algo que ele não escolhe e não teria como prever.

**A cobrança vence 24h antes da sessão, não no agendamento.** É o que fecha o
buraco do estorno. O split do Asaas é instantâneo: dinheiro pago no agendamento
já estaria na conta do psicólogo dias antes da sessão, e um cancelamento
gratuito exigiria puxar de volta um valor que ele talvez já tivesse sacado,
deixando a subconta negativa. Vencendo junto com o fim da janela de cancelamento
gratuito, **quem cancela a tempo simplesmente nunca pagou** e não existe estorno
a fazer.

**Falha ao criar subconta não impede a aprovação.** O cadastro do psicólogo está
correto; o que falhou foi integração externa. O erro fica em
`asaas_account_error` para o admin ver, e a rota de cobrança recusa agendamento
com quem não tem carteira.
