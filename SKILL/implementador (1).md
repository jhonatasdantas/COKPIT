# Implementar Plano

Execute um plano técnico fase a fase. Use quando já existe um plano revisado
e você está pronto para construir.

## Quando Usar

- "Implementa esse plano"
- "Vamos começar a fase N"
- "Executa o plano de criação do site X"
- Após um plano técnico ter sido revisado e aprovado

---

## Arquitetura: Orquestrador + Dois Agentes por Fase

O contexto principal é o **orquestrador**. Ele segura o plano, rastreia
o progresso, toma decisões e se comunica com você. Ele nunca escreve
código ou faz alterações diretamente.

Cada fase roda dois subagentes em sequência:

1. **Agente de Implementação** — recebe o briefing da fase, pesquisa o
   projeto, executa todo o trabalho (código, configuração, deploy). Retorna
   um relatório de implementação.
2. **Agente de Verificação** — recebe os critérios de verificação e o
   relatório do agente anterior, confere tudo com olhos frescos. Retorna
   um relatório de verificação.

Essa separação garante que quem implementa foca em construir, e quem
verifica avalia sem o viés de ter feito o trabalho.

```
Contexto principal (orquestrador)
  ├── lê o plano, rastreia os marcadores de progresso
  ├── briefing para agente de implementação → recebe relatório
  ├── briefing para agente de verificação   → recebe relatório
  ├── atualiza os marcadores no plano
  ├── trata decisões / escalações para você
  ├── faz commit da fase (se aplicável)
  └── avança para a próxima fase

Agente de Implementação (subagente 1)
  ├── recebe: briefing da fase (objetivo, tarefas, restrições, contexto anterior)
  ├── pesquisa as áreas relevantes do projeto
  ├── executa o trabalho (lê antes de editar, segue os padrões existentes)
  └── retorna: relatório (arquivos alterados, decisões tomadas, problemas encontrados)

Agente de Verificação (subagente 2)
  ├── recebe: critérios de verificação, relatório de implementação, restrições
  ├── executa cada verificação com comandos reais
  ├── em falha: até 2 tentativas de correção por verificação
  └── retorna: relatório (passou/falhou por verificação, correções aplicadas, problemas não resolvidos)
```

---

## Princípios

- **O plano é a fonte da verdade.** Toda ação tem origem em um item do plano.
- **O plano é o rastreador de estado.** Marque o progresso diretamente no
  arquivo do plano para que qualquer sessão (ou colaborador) saiba exatamente
  onde as coisas estão.
- **Faça o trabalho.** Escreva código, rode comandos, entregue resultados.
  Pause apenas quando uma decisão genuinamente precisa da sua opinião.
- **Contexto é finito.** O orquestrador fica enxuto. Os agentes carregam
  o contexto pesado (leitura de arquivos, escrita, saída de comandos) e
  descartam quando terminam.
- **Falhe rápido, recupere com inteligência.** O agente de verificação tenta
  corrigir (até 2 rodadas). Problemas não resolvidos sobem para o orquestrador,
  que os apresenta a você.

---

## Processo

### 1. Vincular ao Plano

Leia o arquivo do plano. Verifique marcadores de progresso existentes (veja
*Rastreamento de Progresso* abaixo). Confirme com você:

- Quais fase(s) executar nesta sessão
- Qualquer mudança desde a última revisão do plano

Reafirme o objetivo da fase e os critérios de verificação em 2-3 linhas.
Esse é o contrato da sessão.

### 2. Lançar Agente de Implementação

Marque a fase como `🟡 EM ANDAMENTO` no arquivo do plano.

Componha um briefing de implementação contendo:

1. **Objetivo da fase** — a linha "Objetivo" do plano
2. **Tarefas** — a lista completa "O que fazer" desta fase
3. **Restrições do projeto** — itens relevantes das instruções do projeto
   (comandos de build, convenções de nome, padrões, tecnologias usadas)
4. **Contexto de fases anteriores** — se esta fase depende de fases
   anteriores, inclua decisões-chave e quaisquer desvios dos relatórios
   anteriores
5. **Regras do agente de implementação** (veja abaixo)

Lance o agente de implementação com esse briefing.

#### Regras do Agente de Implementação

Inclua estas em todo briefing do agente de implementação:

- **Leia antes de escrever.** Nunca edite um arquivo sem antes lê-lo.
  Nunca crie um padrão sem encontrar primeiro uma implementação de referência.
- **Siga os padrões do projeto.** Encontre 1-2 implementações existentes para
  espelhar em estilo e estrutura. Se o plano referencia arquivos ou padrões
  que não existem, reporte — não adapte silenciosamente.
- **Não pause por estilo.** Tome decisões em detalhes menores que o plano
  deixou em aberto. Anote no relatório. Pare apenas para ambiguidade genuína
  onde duas interpretações levam a resultado diferente.
- **Relate de volta** com: arquivos criados/modificados, decisões tomadas,
  quaisquer desvios do plano e o motivo, quaisquer bloqueios encontrados.

### 3. Lançar Agente de Verificação

Após o agente de implementação retornar, componha um briefing de verificação
contendo:

1. **Critérios de verificação** — o checklist "Verificar" do plano
2. **Relatório de implementação** — resumo do agente de implementação
   (arquivos alterados, o que foi construído, desvios)
3. **Restrições do projeto** — comandos de build/run das instruções do projeto
4. **Regras do agente de verificação** (veja abaixo)

Lance o agente de verificação com esse briefing.

#### Regras do Agente de Verificação

Inclua estas em todo briefing do agente de verificação:

- **Execute cada verificação** dos critérios usando comandos reais do projeto.
  Reporte cada uma como passou/falhou com a saída.
- **Em falha — até 2 tentativas de correção por verificação:**
  - Rodada 1: Diagnostique a causa raiz. Leia os arquivos relevantes.
    Tente uma correção cirúrgica. Re-execute a verificação.
  - Rodada 2: Se ainda falhar, tente mais uma correção. Re-execute.
  - Após 2 tentativas falhas: pare de tentar corrigir essa verificação.
    Inclua no relatório: o que a verificação espera, o que está acontecendo,
    o que foi tentado, teoria da causa raiz, próximos passos sugeridos.
- **Relate de volta** com: passou/falhou por verificação, correções aplicadas
  (arquivos modificados), falhas não resolvidas com diagnóstico completo.

### 4. Processar Relatórios

Quando ambos os agentes retornarem:

**Se todas as verificações passarem:**
- Marque a fase como `✅ CONCLUÍDO` no arquivo do plano
- Marque tarefas individuais como `✅` no arquivo do plano
- Apresente um breve resumo a você (arquivos alterados, decisões-chave)
- Anote quaisquer desvios do plano

**Se a verificação tiver falhas não resolvidas:**
- Mantenha a fase como `🟡 EM ANDAMENTO`
- Apresente a você:
  - Quais verificações passaram, quais falharam
  - O diagnóstico do agente de verificação para cada falha
  - Próximos passos sugeridos
- Aguarde sua decisão antes de prosseguir

**Se o agente de implementação encontrou ambiguidade e parou:**
- Apresente a decisão a você
- Uma vez resolvida, lance um novo agente de implementação com a decisão +
  tarefas restantes, depois siga com um agente de verificação normalmente

Repita até que todas as fases solicitadas estejam completas.

---

## Rastreamento de Progresso

Marque o progresso diretamente no arquivo do plano para que o estado
sobreviva entre sessões.

**Marcadores de fase** — adicione ao cabeçalho da fase:

```
## Fase 1: Configurar Estrutura do Projeto ✅ CONCLUÍDO
## Fase 2: Desenvolver Páginas Principais 🟡 EM ANDAMENTO
## Fase 3: Configurar Hospedagem e Domínio
## Fase 4: SEO e Otimizações Finais
```

**Marcadores de tarefa** — prefixe os itens individuais em "O que fazer":

```
- ✅ Criar repositório no GitHub
- ✅ Configurar projeto com a stack escolhida
- 🟡 Desenvolver componentes do header e footer
- Criar página Home
- Criar página Sobre
- Conectar formulário de contato
```

**Regras:**
- Apenas três estados: sem marcador (não iniciado), `🟡` (em andamento), `✅` (concluído)
- Somente o orquestrador atualiza os marcadores — não os agentes
- No início da sessão, os marcadores existentes dizem exatamente onde retomar
- Se a verificação falhar e você escalar para decisão, deixe a fase
  como `🟡` — não marque `✅` até a verificação passar

---

## Modelo de Plano Técnico

Use esta estrutura ao criar um novo plano técnico para qualquer projeto:

```markdown
# Plano Técnico: [Nome do Projeto]

**Tipo:** Site institucional / Landing page / Sistema web / App / etc.
**Cliente / Contexto:** [Descrição breve]
**Stack:** [Ex: Next.js + Tailwind + Supabase + Vercel]
**Repositório:** [URL ou caminho local]

---

## Fase 1: [Nome da Fase]

**Objetivo:** [Uma frase clara do que esta fase entrega]

**O que fazer:**
- Tarefa 1
- Tarefa 2
- Tarefa 3

**Verificar:**
- Critério 1 (ex: build passa sem erros)
- Critério 2 (ex: página abre no navegador)
- Critério 3 (ex: formulário envia e recebe email)

---

## Fase 2: [Nome da Fase]

...
```

---

## Padrões do Projeto (Herança Automática)

O orquestrador herda automaticamente das instruções do projeto:

- Comandos de build/run/deploy (ex: `npm run dev`, `npm run build`, `vercel deploy`)
- Convenções de nomenclatura e padrões de código
- Tecnologias e frameworks utilizados (ex: React, WordPress, Webflow)
- Configurações de hospedagem (ex: Vercel, Netlify, cPanel, VPS)
- Variáveis de ambiente necessárias

Não peça a você para repetir o que as instruções do projeto já dizem.
Inclua as restrições relevantes em todo briefing de agente.
