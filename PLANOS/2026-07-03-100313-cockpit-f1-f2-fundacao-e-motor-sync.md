# Plano Técnico — Cockpit Ide: Fundação (F1) + Motor de Sync Shopee (F2)

> Deriva de `PLANOS/ARQUITETURA-SAAS.md`. Recorte: **F1 + F2** do Cockpit demo
> (SaaS-ready por baixo, tenant único = sua agência, **sem billing**). 1º connector:
> **Shopee**. Diretriz transversal: **maximizar primitivos Cloudflare** — o mínimo
> possível fora da nuvem Cloudflare (Supabase só para Auth + Postgres/pgvector, como a
> arquitetura fixou).

**História de usuário:**
Como **consultor/agência de e-commerce**, quero **um cockpit que sincroniza sozinho os
dados das minhas lojas Shopee e me mostra vendas, ads e alertas confiáveis**, para que
**eu pare de depender do n8n travando (timeout 300s, dessync de token) e tenha um dado em
que confio**.

---

## 0. Pré-requisitos externos — apps do marketplace (você cria, uma vez)

A API oficial exige um **app** por marketplace/categoria, criado por **você (a agência)** no
portal de cada plataforma. Não é por cliente: **o cliente só clica em "autorizar" (OAuth)** e
liga a loja dele ao *seu* app. 5 ou 5.000 lojas usam os mesmos apps. O que cresce com o nº de
lojas é a **cota (rate limit é por app/partner)** — quando apertar, sobe de tier.

| Marketplace | Apps a criar | Quando | Observação |
|---|---|---|---|
| **Shopee** | 1 app Open Platform (ERP) — e **+1 para Ads** se for usar métricas de anúncio | **Agora** (F2) | HMAC + escopos separados por categoria |
| **Mercado Livre** | 1 app no DevCenter | **Futuro** (F3) | OAuth padrão; só criar quando for plugar o `MLConnector` |

**Pré-requisito só do SaaS pago (não bloqueia o demo):** servir lojas de **terceiros** sob o
seu app depende de **termos de parceiro/ISV** de cada plataforma (limite de lojas por app,
rate por partner, programa ISV). Pro demo (sua agência, suas lojas) não trava — vira bloqueio
só na fase de monetização.

**Implicação no design:** conectar o Mercado Livre no futuro = criar o app ML **uma vez** +
escrever a classe `MLConnector` sobre o mesmo contrato `MarketplaceConnector` (Fase 4). O
motor (Durable Object, Queues, Cron, `sync_runs`) **não muda** — é por isso que a abstração de
connector é validada já na F2 pensando no 2º marketplace.

---

## 1. Visão Geral

Construir a fundação multi-tenant do Cockpit em Cloudflare Workers (Hono) com Supabase
(Auth + Postgres/RLS), e sobre ela o motor de sync onde **cada loja Shopee = um Durable
Object** que é dono do token, do agendamento (`alarm`), do cursor incremental e do
rate-limit — alimentando Postgres via upsert idempotente e registrando cada execução em
`sync_runs`. Áreas afetadas: novo monorepo (API Workers + Pages React), schema Postgres
multi-tenant, pipeline OAuth/sync Shopee, observabilidade de sync.

**Diretriz Cloudflare-native (aplica a todas as fases):** compute em Workers; coordenação
por loja em Durable Objects; fila/retry/DLQ em Queues; agendamento em Cron Triggers;
conexão Postgres via Hyperdrive; arquivos em R2; segredos em Workers Secrets; frontend em
Pages. Nada de VPS, Redis ou runner externo.

---

## 2. Fases de Implementação

### Fase 1: Monorepo + Worker "hello" no ar

**Objetivo:** existe um monorepo versionado com um Worker Hono publicado na Cloudflare
respondendo a uma rota de saúde, e o Pages servindo o React atual.

**O que fazer:**
- Criar monorepo (workspaces): pacote `api` (Worker/Hono) e pacote `web` (React/Vite → Pages).
- Configurar o Worker com uma rota de health check e binding de ambiente básico.
- Configurar deploy do Worker e do Pages (contas/projetos Cloudflare) e um CI mínimo
  (lint + build + deploy em push na branch principal).
- Definir gestão de segredos via Workers Secrets (nada hardcoded; arquivo de exemplo de vars).

**Verificar:**
- [ ] `GET /health` do Worker publicado retorna 200 com corpo de status.
- [ ] Build do `web` gera artefato e o Pages serve a página inicial sem erro de console.
- [ ] CI roda verde num push (lint + build).

### Fase 2: Auth Supabase + isolamento multi-tenant (RLS)

**Objetivo:** um usuário loga via Supabase, o Worker valida o JWT, extrai o `tenant_id` e
toda query fica isolada por tenant via RLS — impossível ler dado de outro tenant.

**O que fazer:**
- Provisionar Supabase Auth; definir que o JWT carrega `tenant_id` e papel como claim.
- Criar as tabelas núcleo de identidade (`tenants`, `usuarios` ligado ao Auth) com
  `tenant_id` e políticas RLS por tenant.
- Middleware no Worker: validar JWT, rejeitar sem token, injetar `tenant_id` no contexto
  de request e em toda conexão ao Postgres (via Hyperdrive).
- Seed do tenant único (sua agência) e um usuário da equipe.

**Verificar:**
- [ ] Request sem/`com` JWT inválido a uma rota protegida retorna 401.
- [ ] Request autenticado só enxerga linhas do próprio `tenant_id` (teste com 2 tenants seed → 0 vazamento).
- [ ] Login de ponta a ponta pela web resulta em sessão válida usada pelo Worker.

### Fase 3: Schema de dados do domínio (multi-tenant)

**Objetivo:** o banco tem o modelo essencial para lojas, produtos, vendas, ads, alertas e
observabilidade — tudo com `tenant_id` + RLS e chaves de idempotência para upsert.

**O que fazer:**
- Criar tabelas de domínio: `clientes`, `contas_marketplace`, `oauth_tokens` (acesso só
  service-role), `produtos`, `vendas`, `metricas_diarias`, `campanhas_ads`,
  `metricas_ads_diarias`, `alertas`, `tarefas`, `sync_runs`.
- Definir restrições de unicidade (on-conflict) que garantem upsert idempotente por entidade.
- Aplicar RLS por tenant em todas; `oauth_tokens` acessível só por caminho service-role.
- Versionar migrações e um caminho de aplicação repetível.

**Verificar:**
- [ ] Migrações aplicam do zero sem erro num banco limpo.
- [ ] Reaplicar o mesmo registro (mesma chave) não duplica linha (teste de upsert).
- [ ] Consulta cross-tenant retorna vazio sob RLS.

### Fase 4: OAuth Shopee + guarda segura de token

**Objetivo:** dá para conectar manualmente uma loja Shopee real da sua agência via OAuth e
o token/refresh fica guardado com segurança, associado à conta e ao tenant.

**O que fazer:**
- Implementar o início e o callback do OAuth Shopee (assinatura HMAC reaproveitada do domínio atual).
- Persistir credenciais em `oauth_tokens` (só service-role), vinculadas a `contas_marketplace`.
- Definir a interface `MarketplaceConnector` (contrato: oauthStart/callback, refreshToken,
  syncProducts, syncOrders, syncAds, normalize) e a implementação inicial do `ShopeeConnector`
  cobrindo start/callback/refresh.
- Fluxo manual de conexão de loja (sem self-serve ainda), como é hoje.

**Verificar:**
- [ ] Fluxo OAuth com uma loja real termina com token válido persistido e vinculado ao tenant.
- [ ] `refreshToken` renova credencial expirada e a nova é a usada nas chamadas seguintes.
- [ ] Assinatura HMAC validada contra fixture real (teste passa).
- [ ] O contrato `MarketplaceConnector` é agnóstico de plataforma: nenhuma assinatura/tipo do
  contrato menciona "Shopee" (revisão do contrato confirma que um 2º connector caberia sem alterá-lo).

### Fase 5: Durable Object por loja — token com lock + rate-limit

**Objetivo:** cada loja conectada tem um Durable Object que é o dono único do token
(refresh com lock, matando a corrida do bug da Belle) e do rate-limit (token bucket),
serializando o acesso à API Shopee.

**O que fazer:**
- Criar o Durable Object "loja" (1 instância por conta de loja) responsável por: obter/renovar
  token sob lock, manter cursor incremental e aplicar rate-limit próprio (token bucket).
- Expor um caminho para o Worker "cutucar" o DO da loja (disparo de sync sob demanda).
- Garantir que toda chamada à API Shopee da loja passe pelo DO (nenhum caminho paralelo renovando token).

**Verificar:**
- [ ] Dois disparos concorrentes de sync na mesma loja resultam em **um** refresh de token (lock funciona).
- [ ] Rajada de chamadas respeita o rate-limit configurado (nenhuma acima do teto por janela).
- [ ] Cada loja usa uma instância de DO distinta (isolamento por loja).

### Fase 6: Sync Shopee end-to-end + Queues/Cron + sync_runs

**Objetivo:** produtos e vendas de uma loja Shopee real entram no Postgres normalizados, de
forma idempotente, agendados por Cron e resilientes via Queues (retry/backoff/DLQ), com cada
execução registrada em `sync_runs`.

**O que fazer:**
- Implementar `syncProducts` e `syncOrders` do `ShopeeConnector` + `normalize` (parsing,
  correção preço/estoque por modelo, fuso BR no bucketing — reaproveitados do domínio).
- Persistir via upsert idempotente nas tabelas de domínio; usar cursor do DO para incremental.
- Orquestrar com Cron Trigger (agendamento) + Queues (fila com retry/backoff e dead-letter);
  o DO se auto-agenda via `alarm` no intervalo dele.
- Registrar início/fim/status/contagens/erro em `sync_runs` a cada execução; manter
  `ultimo_sync` sempre verdadeiro.

**Verificar:**
- [ ] Um ciclo de sync de loja real popula `produtos` e `vendas` com contagens > 0.
- [ ] Rodar o sync duas vezes seguidas não duplica registros (idempotência).
- [ ] Falha simulada na API vai para retry e, esgotado, para a DLQ (não some silenciosamente).
- [ ] Cada execução gera uma linha em `sync_runs` com status e contagens coerentes.

### Fase 7: Tela de observabilidade do sync

**Objetivo:** a web mostra, por loja, a última sync real, status, contagens e falhas —
lidos de `sync_runs`, expondo atrasos/travas em vez de "sensação".

**O que fazer:**
- Rota no Worker que serve o resumo de `sync_runs` por loja/tenant (sob RLS).
- Tela no React (reaproveitando componentes existentes) listando lojas com último sync,
  status, contagens e destaque para falha/atraso.

**Verificar:**
- [ ] A tela mostra o `ultimo_sync` real correspondente à linha mais recente em `sync_runs`.
- [ ] Uma sync que falhou aparece sinalizada como falha na tela.
- [ ] Dados exibidos respeitam o tenant logado (sem vazamento cross-tenant).

---

## 3. Casos de Borda

- Se o token da loja expira no meio de um sync, então o DO renova sob lock e retoma sem
  disparar segundo refresh concorrente.
- Se a API Shopee retorna rate-limit/erro transitório, então a mensagem vai a retry com
  backoff; esgotadas as tentativas, vai à DLQ e a execução é marcada como falha em `sync_runs`.
- Se o mesmo pedido/produto chega duas vezes (reprocesso ou sobreposição de janela), então o
  upsert idempotente não cria duplicata.
- Se um pedido vem em fuso diferente do BR, então o bucketing normaliza para o fuso BR antes
  de agregar em `metricas_diarias`.
- Se um request chega sem JWT ou com `tenant_id` de outro tenant, então RLS/middleware barram
  (401 ou resultado vazio) — nunca leitura cruzada.
- Se o Cron dispara enquanto um sync anterior da mesma loja ainda roda, então o DO serializa
  (não roda dois syncs simultâneos da mesma loja).
- Se o `alarm` do DO falha em disparar, então o Cron periódico serve de rede de segurança
  para o próximo ciclo.

## 4. Testes Automatizados

### 4.1 Testes Unitários — cenários
- Validação de assinatura HMAC Shopee contra fixtures reais (válida e adulterada).
- `normalize`: parsing de produto/pedido Shopee → forma canônica, incluindo correção de
  preço/estoque por modelo.
- Bucketing por fuso BR: entradas em fusos distintos caem no dia correto.
- Idempotência de upsert: aplicar o mesmo registro N vezes → 1 linha.
- Rate-limit (token bucket) do DO: rajada respeita o teto por janela.
- Middleware de auth: sem token → 401; token de outro tenant → sem acesso.

### 4.2 Testes E2E — cenários
- Login → sessão válida → rota protegida acessível só com o tenant certo.
- OAuth Shopee de loja real → token persistido → primeiro sync popula `produtos`/`vendas`.
- Dois disparos concorrentes de sync na mesma loja → um refresh de token, sem duplicatas.
- Falha injetada na API → retry → DLQ → `sync_runs` marca falha e a tela de observabilidade
  a exibe.
- Segundo ciclo de sync incremental usa cursor e não reprocessa a janela inteira.

## 5. Melhorias Futuras (fora do escopo deste plano)

- **F3 — Paridade:** 2º marketplace (Mercado Livre), Ads (`syncAds` + métricas), as 8 regras
  de alerta, e reconciliação (cockpit × re-fetch) como métrica de confiança; strangler contra o n8n.
- **Base de conhecimento (KB):** `kb_docs` + pgvector para RAG.
- **F4 — Monetização (adiado):** billing Stripe (`assinaturas`, gating por plano),
  onboarding self-service, planos.
- **Webhooks near-real-time:** Worker cutuca o DO da loja no push da plataforma (já previsto na arquitetura).
- **Hardening:** Sentry, logs estruturados (pino) nos Workers, alerta interno de falha de infra.
- **Isolamento físico por tenant:** 1 banco por tenant (só se algum cliente exigir).
