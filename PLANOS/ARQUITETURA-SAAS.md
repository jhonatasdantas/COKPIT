# Arquitetura SaaS — Cockpit Ide (rewrite code-first, Cloudflare-native)

> Documento de arquitetura para reescrever o Cockpit como **produto SaaS multi-tenant**,
> tudo em código, saindo do n8n. Serve de fonte da verdade portátil — qualquer sessão/dev
> executa a partir daqui. Complementa `STATUS-PROJETO.md` (o estado atual do sistema n8n).

---

## 0. Objetivo e premissas

- **Objetivo:** produto **SaaS multi-tenant** (vender pra várias agências/consultores), com escala.
- **Code-first:** toda a lógica em TypeScript, versionada, testada. Fim do n8n.
- **Cloudflare-native** pro compute; **Supabase** pro login e dados; **Stripe** pra cobrança.
- **Não jogar fora** o conhecimento de domínio já sangrado (HMAC Shopee, parsing, fuso BR, regras de alerta) nem o frontend React.

**🎯 Prioridade atual (em fase de teste):** construir primeiro um **Cockpit demo** — como
algo interno, rodando com a **sua agência como tenant único** e os **seus apps ML/Shopee
atuais** (o que já funciona) — mas com a **arquitetura já SaaS-ready** (multi-tenant por
baixo, connectors, observabilidade). **Ficam pra DEPOIS (quando virar SaaS pago):** validar
termos ISV/parceiro (só importa pra servir terceiros), **billing (Stripe)**, self-serve
signup e planos. A base multi-tenant entra desde já pra não reescrever depois.

## ⚠️ Pré-requisito do SaaS PAGO (não bloqueia o demo)

**Termos de parceiro do marketplace para servir terceiros.** Só importa quando **outras
agências/lojas que você não conhece** forem usar. **O demo não precisa** — roda com a sua
agência e seus apps atuais. Antes de abrir pra terceiros, confirmar com ML e Shopee: limite
de lojas por app, rate limit por partner, e programa "Service Provider / ISV". Se for
restrito, redesenha. É a pergunta nº 1 **da monetização**.

---

## 0.1 Dependência de plataforma, apps e sustentabilidade (base pra escalar)

**Os apps ML/Shopee são obrigatórios e insubstituíveis** para ler dado oficial — é o preço
de entrada da API, não escolha de arquitetura. O que sustenta a escala:

- **Não multiplica por cliente:** você mantém um **conjunto fixo e pequeno** de apps (1 por
  marketplace + 1 por categoria na Shopee, ex. ERP e Ads). O cliente **não cria app** — só
  clica em "autorizar". 5 ou 5.000 clientes usam os mesmos apps.
- **Rate limit é por partner** → mais lojas consomem sua cota. Escalar exige monitorar cota
  e, quando apertar, subir de tier / pedir aumento.
- **Dependência de plataforma é o risco central** (inerente a QUALQUER agregador — o Kinvo
  idem com corretoras): ML/Shopee podem mudar termos, aposentar endpoint ou competir. Não
  some; se **mitiga**.

**As 2 alavancas de sustentabilidade:**
1. **Programa oficial de Parceiro / ISV** — não só um app público. Formaliza o direito de
   servir terceiros e costuma dar **limites e suporte melhores**. É a postura de SaaS.
2. **Multi-marketplace** — não depender de um só. Se a Shopee apertar, você tem ML, Amazon,
   Magalu, etc. Diversificação = resiliência.

**Alternativas (por que a API oficial vence):**

| Forma | Veredito |
|---|---|
| Scraping (robô no painel) | ❌ contra ToS (ban), quebra a cada mudança de tela, exige a senha do lojista (liability) |
| Login do lojista / logar como ele | ❌ inseguro + contra ToS |
| API intermediária (revende dado) | ⚠️ troca um middleman por outro; limitado no BR |
| Lojista exporta CSV e sobe | ⚠️ sem app, mas UX ruim e nada real-time — só fallback |
| **API oficial + seus apps + ISV** | ✅ sancionado, escalável, sustentável |

**Reframe:** o app é a parte **normal** (todo concorrente tem os mesmos). A parte a blindar é
a dependência de plataforma → **ISV + multi-marketplace**.

---

## 1. Visão de alto nível

```
Cloudflare Pages (React)  ──►  Cloudflare Workers (API, Hono, TS)  ──►  Supabase Postgres (RLS multi-tenant)
                                     │        │                              + pgvector (KB)
                          Stripe ◄───┘        │                         Supabase Auth (login/signup)
                                              ▼
                                   Cron Triggers + Queues
                                              ▼
                              Durable Object POR LOJA (coordenador de sync)
                                     │  token+lock · rate-limit · cursor · alarm
                                     ▼
                          Connectors (ML / Shopee / …) → normaliza → Postgres
                                                                      R2 (PDFs/exports)
```

## 2. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend | **Cloudflare Pages** (React/Vite) | já existe |
| API + lógica | **Cloudflare Workers** (Hono, TS) | serverless, escala a zero, sem VPS |
| Orquestração de jobs | **Cron Triggers + Queues** | agendamento + fila com retry/DLQ nativos |
| **Coordenação por loja** | **Durable Objects** | 1 DO por loja = token+lock, rate-limit, cursor, alarm (ver §4) |
| Auth (login) | **Supabase Auth** | não se hand-rola auth; signup/sessão/JWT prontos |
| Dados | **Supabase Postgres** (via Hyperdrive) | relacional, RLS multi-tenant, pgvector p/ KB |
| Busca vetorial (KB) | **pgvector** (Supabase) ou **Vectorize** | RAG da base de conhecimento |
| Arquivos | **R2** | PDFs de relatório, exports |
| Cobrança | **Stripe** _(ADIADO — pós-teste)_ | planos, trial, upgrade, inadimplência |
| Segredos | **Workers Secrets** | zero hardcode |

**Some:** n8n (vira Workers), VPS, Redis (Queues+DO cobrem fila/lock/estado).

## 3. Multi-tenancy

- **Modelo:** `tenant_id` em TODA tabela. Isolamento via **RLS** no Postgres (policy por tenant).
- **Auth → tenant:** o JWT do Supabase carrega o `tenant_id` (claim); o Worker valida e injeta em toda query.
- **Orçamento por tenant:** rate-limit e cotas de sync por tenant (evita um cliente derrubar os outros).
- (Opção avançada: 1 banco por tenant p/ isolamento físico — só se exigirem; começa com RLS.)

## 4. O motor de sync (o coração) — ⭐ Durable Object por loja

Em vez de um cron varrendo tudo num loop (o que deu **timeout 300s** e **dessync de token** no n8n),
**cada loja conectada = 1 Durable Object** (ator single-thread) que é dono de:

- **token + refresh com lock** → mata a corrida (bug da Belle: dois processos renovando o mesmo token);
- **agendamento próprio** via `alarm()` → sincroniza sozinho no intervalo dele;
- **cursor do incremental** → não recalcula janela toda vez;
- **rate-limit próprio** (token bucket) → nunca atropela a API nem toma ban;
- reação a **webhook** → o Worker "cutuca" o DO da loja → sync na hora (near-real-time onde a API manda push).

Escala natural: 1000 lojas = 1000 DOs independentes, sem loop gigante, sem teto de tempo.

### Connectors (abstração por marketplace)
Interface `MarketplaceConnector`: `oauthStart/callback`, `refreshToken`, `syncProducts`,
`syncOrders`, `syncAds`, `normalize`. Uma classe por plataforma (`MLConnector`, `ShopeeConnector`, …).
Adicionar marketplace = escrever uma classe **testada com fixtures reais** (é aqui que
divergência de fuso/atribuição é pega antes de produção).

### Garantias
- **Upsert idempotente** (on_conflict) — reprocesso não duplica.
- **Retry + backoff + dead-letter** (Queues) — fim do "só funciona quando reclamo".
- **`sync_runs`** (início, fim, status, contagens, erro) por execução → observabilidade **de graça**
  e `ultimo_sync` sempre verdadeiro (o bug que achamos na auditoria).

## 5. Modelo de dados (multi-tenant, essencial)

Todas com `tenant_id` + RLS. Núcleo:
`tenants`, `usuarios` (↔ Supabase Auth), `clientes`, `contas_marketplace`,
`oauth_tokens` (service-role), `produtos`, `vendas`, `metricas_diarias`,
`campanhas_ads`, `metricas_ads_diarias`, `alertas`, `tarefas`, `relatorios`,
`sync_runs` (observabilidade), `assinaturas` (Stripe). KB em `kb_docs` + pgvector.

## 6. Auth & billing
- **Auth:** Supabase (login/sessão). JWT com `tenant_id` + papel. No **demo**: login simples da equipe; self-serve signup vem com o billing.
- **Billing:** Stripe — **ADIADO (pós-teste)**. Modelo já previsto (`assinaturas`, gating por plano), mas não se implementa agora — "não quebrar cabeça com pagamento enquanto testa".
- **Onboarding self-service:** **depois** (junto do billing). No demo, contas/lojas são conectadas manualmente, como hoje.

## 7. Observabilidade & confiabilidade
- `sync_runs` alimenta a tela de observabilidade (última sync real, falhas, atrasos).
- **Reconciliação como métrica:** job amostra e compara cockpit × re-fetch, sinaliza divergência
  acima da margem → "confiança no dado" vira algo **monitorado**, não sensação.
- Erros → Sentry; logs estruturados (pino) nos Workers; alerta interno em falha de infra.

## 8. O que reaproveita do sistema atual
- **Domínio:** HMAC Shopee, correção preço/estoque por modelo, fuso BR no bucketing,
  parsing ML/Shopee, as 8 regras de alerta. Migra ~1:1.
- **Frontend React** (telas, semáforo, gráficos).
- **Modelo de dados** (evolui com `tenant_id`).

## 9. Migração (strangler — nunca big-bang)
1. Sobe o backend novo (Workers) **ao lado** do n8n.
2. Migra **1 connector por vez** (começar por `refresh-token` + `sync` de 1 plataforma).
3. Roda **em paralelo**, compara resultado com o n8n (reconciliação).
4. Só desliga o workflow n8n equivalente quando tiver **paridade**.
5. Repete até o n8n sair de cena. **Zero dia sem dado.**

## 10. Riscos & tradeoffs (honestos)
- **Termos de parceiro do marketplace** (§ pré-requisito) — o maior risco externo.
- **Armadilha do rewrite:** meses até paridade; por isso strangler + sistema atual vivo.
- **Lock-in Cloudflare** (DO/Queues são proprietários).
- **Curva dos Durable Objects** (modelo de atores; poucos devs dominam).
- **Unit economics:** custo por tenant (Claude, WhatsApp, storage, compute) **<** preço da assinatura.

## 11. Fases sugeridas
- **F0 — Validação SaaS (ADIADO — só pra virar SaaS pago; o demo NÃO precisa):** (dias)
  - **Termos de parceiro / ISV:** ML e Shopee permitem servir lojas de terceiros sob seus apps? Tem programa ISV? Limite de lojas / rate por partner? Como subir de tier?
  - **Demanda & preço:** quem compra (agências? sellers?), a quanto.
  - **Unit economics:** custo por tenant (Claude, WhatsApp, storage, compute) < assinatura.
  - Saída: go/no-go + eventual redesenho se o acesso a terceiros for restrito.
> **🎯 FOCO AGORA = F1–F3 (o Cockpit demo):** SaaS-ready por baixo, tenant único (sua agência), **sem billing**. F0 e F4 ficam pra quando virar SaaS pago.

- **F1 — Fundação:** monorepo, Workers+Hono, Supabase Auth+RLS multi-tenant, deploy, CI. (1–2 sem)
- **F2 — Motor de sync:** Connector + DO por loja + Queues/Cron + `sync_runs`; 1 marketplace end-to-end. (2–3 sem)
- **F3 — Paridade:** 2º marketplace + Ads + alertas + reconciliação; strangler contra o n8n. (2–4 sem)
- **F4 — Produto / monetização (ADIADO — pós-teste):** billing (Stripe), onboarding self-service, planos. (A observabilidade por tenant já entra antes.)
- **F5 — Go-to-market:** migrar/onboardar primeiros clientes pagantes; hardening.

**Ordem de grandeza:** ~3–6 meses pra um v1 vendável, com o sistema atual rodando em paralelo.

---

## Resumo em 1 frase
**Cloudflare Workers (todo o código) + Durable Object por loja (motor de sync) + Supabase
(Auth + Postgres/pgvector) + R2 (PDFs) + Pages (React)** — code-first, multi-tenant,
reaproveitando o domínio e o frontend que já existem. **Foco agora: Cockpit demo SaaS-ready
(tenant único, sua agência, sem billing).** Billing (Stripe) e validação de termos
ISV/parceiro entram só na **fase de monetização**.
