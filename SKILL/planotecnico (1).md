# Plano Técnico

Planejamento estruturado para funcionalidades e mudanças. Use quando precisar
projetar, planejar ou arquitetar uma solução antes de codar.

## Quando Usar

- "Gera um plano técnico para X"
- "Como devo construir Y?"
- "Projeta uma abordagem para Z"

Para mudanças simples (arquivo único, config, ajuste pequeno), pule o
planejamento e vá direto para a implementação.

## Processo

### 1. Entender e Enquadrar

Inferir uma história de usuário: "Como [papel], eu quero [objetivo], para que [benefício]."
Foque no usuário final do produto (cliente do site, visitante, usuário do sistema).

Confirme a história de usuário antes de continuar.

### 2. Pesquisar o Contexto

Antes de propor qualquer coisa, investigue o que já existe:
- Encontre arquivos relevantes e trace como funcionalidades similares funcionam
- Identifique 2-3 implementações parecidas como padrão de referência
- Busque enums, constantes e abstrações reutilizáveis
- Cite achados com referências arquivo:linha

Após a pesquisa, verifique expansão de escopo:
- Existem componentes relacionados que deveriam receber a mesma mudança?
- Apresente candidatos e confirme o escopo antes de continuar.

### 3. Clarificar e Projetar

Trabalhe cada aspecto um de cada vez.

**Se for uma pergunta** (requisitos, escopo, restrições):
Faça uma pergunta clara. Espere a resposta.

**Se for uma decisão** (abordagem de implementação):
Apresente as opções, cada uma com:
- O que é
- Prós / Contras
- Quando é a escolha certa
- Sua recomendação e por quê
- O que você está trocando ao recomendar

Uma pergunta ou decisão por vez. Não acumule.

### 4. Restatar e Confirmar

Antes de gerar o plano, restate:
- Problema (uma frase)
- História de usuário
- Escopo (dentro / fora)
- Restrições
- Soluções escolhidas com justificativa

Obtenha confirmação antes de gerar.

### 5. Gerar o Plano

Estrutura (descrições conceituais apenas — sem código, sem SQL, sem caminhos de arquivo):

```
# [Título]

## 1. Visão Geral
1-3 frases. Áreas afetadas.

## 2. Fases de Implementação

Ordene as fases de forma que cada uma construa sobre a anterior e seja
verificável independentemente. Mantenha as fases pequenas o suficiente para
uma execução focada (regra: ≤8 tarefas, ≤10 arquivos).

### Fase 1: [Nome curto]

**Objetivo:** Uma frase — o que é verdade após essa fase que não era antes.

**O que fazer:**
- Tarefa 1
- Tarefa 2

**Verificar:**
- [ ] Checagem executável (ex: "build passa", "GET /rota retorna 200", "página carrega sem erro")
- [ ] Resultado observável, não vago ("funciona corretamente" não é uma checagem)

### Fase N: ...
(repetir)

## 3. Casos de Borda
Formato "Se X, então Y".

## 4. Testes Automatizados
### 4.1 Testes Unitários — cenários, não código
### 4.2 Testes E2E — cenários, não código

## 5. Melhorias Futuras
Melhorias fora do escopo para depois.
```

**Regras das fases:**
- Toda fase precisa de Objetivo, O que fazer, e Verificar.
- Itens de Verificar devem ser executáveis ou observáveis — algo que um agente
  possa executar e obter um resultado pass/fail. Inclua o comando quando possível.
- Fases são ordenadas por dependência: fase N pode depender das anteriores,
  nunca das posteriores.
- Tarefas de escrita de testes vão na mesma fase que o código que testam.

Salve o plano no diretório `PLANOS/` usando o padrão de nomenclatura:
`Data-de-hoje-nome-da-feature.md` (ano-mes-dia-hora-minuto-segundo-nome_feature.md)
