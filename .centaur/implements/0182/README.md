# [0182] Documentar o app admin Android no `AGENTS.md`, e corrigir HTTPS e import/export S-13/T

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0012/` — Task 14

## Solicitação

> Spec 0012 — Task 14: Atualize o `AGENTS.md` da raiz. (1) Na tabela da Visão Geral, acrescente a
> quarta parte, **App Admin (Android)**, dizendo para quem é (o responsável pelos territórios, em
> campo) e o que faz — designar, concluir, corrigir o histórico da designação e lançar trabalho de
> quadra —, e dizendo explicitamente o que ela **não** faz, que continua só no desktop: desenhar
> demarcação, gerir publicadores, forçar status, apagar registro de trabalho e import/export S-13.
> (2) Acrescente `admin-app/` à árvore da Estrutura do Projeto e uma linha à seção Arquitetura de
> Camadas com as três camadas dele (`presentation`/`domain`/`data`, com `data/` contendo
> `api-client.ts`, `credentials-store.ts` e `session.ts`), e à tabela de Testes. (3) Registre em
> Restrições e Cuidados que a regra de cor da quadra agora vive em **três** arquivos idênticos —
> `admin/src/renderer/map/blockColor.ts`, `app/src/domain/blockColor.ts` e
> `admin-app/src/domain/blockColor.ts` —, atualizando o aviso que hoje fala em dois. (4) Registre
> que o app admin guarda nome, cidade e senha da congregação no keystore do Android, com o mesmo
> cuidado que o desktop tem com o `safeStorage`: nunca em log, nem em debug. (5) Corrija dois
> pontos desatualizados que **não** vieram desta spec, mas que a execução dela verificou: a API de
> produção responde em `https://territorymap.dalistor.com.br` sobre HTTPS, então o aviso "a API está
> exposta em HTTP puro na porta 8000" deve ser reescrito para refletir o proxy com TLS que já
> existe (mantendo o que continua verdade, como a ausência de backup externo do volume
> `postgis_data`); e o admin desktop ganhou import/export S-13/T em DOCX e XLSX
> (`admin/src/main/docx-handler.ts`, `excel-export.ts`) e uma geocodificação de cidade
> (`geocode.ts`) que a documentação ainda não menciona. Não invente comportamento: leia os arquivos
> antes de descrevê-los. Toque apenas em `AGENTS.md`; não modifique código.

## Contexto

A spec 0012 acrescentou um quarto projeto ao monorepo (`admin-app/`, o admin em React Native para
Android) sem que o `AGENTS.md` soubesse dele: o documento ainda dizia "São três partes", a árvore
não tinha a pasta, a Arquitetura de Camadas e a tabela de Testes não tinham a coluna, e o aviso
sobre a duplicação da regra de cor da quadra falava em dois arquivos quando já são três.

Além disso, dois pontos do documento tinham ficado factualmente errados por razões alheias à spec:
o aviso de que a API estava exposta em HTTP puro (ela responde por HTTPS em
`https://territorymap.dalistor.com.br`, atrás do nginx do host) e a ausência total de menção ao
import/export do formulário S-13-T e à geocodificação de cidade, que já existem no admin desktop.

## O que foi feito

Só `AGENTS.md` foi tocado. As mudanças, por seção:

**Visão Geral** — "São três partes" virou "São quatro partes", com a linha **App Admin** na tabela
(público: o responsável pelos territórios, em campo; o que faz: mapa + lista, cartão S-13, designar,
concluir, apagar registro e lançar trabalho de quadra). Logo abaixo, um parágrafo próprio lista o
que ele **não** faz e continua só no desktop. O parágrafo do login silencioso ganhou a metade do
celular (keystore em vez de `safeStorage`, `data/session.ts` em vez de `main/session.ts`), o "Sair
da congregação" passou a dizer "deste computador — ou deste aparelho", e "no app admin ele preenche
o nome da pessoa" virou "só pelo desktop", que era ambíguo agora que "app admin" é um produto.

**Stack Técnica** — linha nova para o App Admin; a linha de Mapas passou a dizer "nos dois apps
Android"; a do Admin desktop ganhou o `jszip`; a de CI/CD passou a falar em três clientes. Uma nota
em blockquote registra por que `admin-app/` é projeto separado e não uma tela dentro de `app/`, e os
dois `applicationId` que permitem os dois APKs conviverem no mesmo aparelho.

**Estrutura do Projeto** — a prosa ganhou (a) o parágrafo do import/export S-13-T do desktop, (b) a
geocodificação de cidade e (c) o parágrafo do `admin-app/`, incluindo o que já existe, o que falta
(a `DesignationsScreen`, Task 10, ainda pendente — hoje há um placeholder em `App.tsx`) e o
pré-requisito de JDK 17. A árvore ganhou o bloco `admin-app/` e, no `admin/`, a pasta `resources/` e
os três arquivos novos do `main/`. A frase de fechamento passou a falar em três projetos TypeScript
independentes.

**Regras de Negócio** — "Cor da quadra no mapa" passou a dizer **três** arquivos idênticos e ganhou
o `blockStatusLabel.ts` (a mesma categoria virando texto no app admin); "Designação de território"
registra que as quatro rotas do cartão agora têm dois clientes e a quinta continua só no desktop;
"Marcar quadra como trabalhada (pelo admin)" idem; "Chave de aplicação" passou a listar os três
clientes HTTP; e o título "App Android" virou "App Android (do publicador)", com uma linha dizendo
que nada daquela seção se aplica ao app admin.

**Arquitetura de Camadas** — subseção nova "App Admin (React Native)", com a tabela das três camadas
(`presentation`/`domain`/`data`, esta última com `api-client.ts`, `credentials-store.ts` e
`session.ts`), a direção `presentation → domain ← data` e o porquê de não haver cache offline.

**Testes** — a tabela ganhou a coluna "App Admin (React Native)"; a nota sobre teste co-localizado,
o parágrafo do `domain/` puro e os dois bullets de "Como mockar" (HTTP e armazenamento) passaram a
cobrir os três clientes.

**Como Rodar / Como Fazer Deploy** — bloco de comandos do `admin-app/` em desenvolvimento e o
`assembleRelease` dele no deploy, com os avisos próprios (JDK 17 ausente nesta máquina,
`com.territorymapadmin`, e que este é o APK de quem tem a senha). O "Ambiente em produção" passou a
nomear o domínio HTTPS e a dizer que o container só escuta em `127.0.0.1:8000`. O aviso de HTTP puro
foi reescrito: registra que o proxy com TLS existe e mantém os dois pedaços que continuam verdade —
`--proxy-headers`/`FORWARDED_ALLOW_IPS` por causa do rate limit por IP, e a ausência de backup do
volume `postgis_data` fora da máquina.

**Regras e Convenções / Restrições e Cuidados** — naming, lint, `LatLng` e "lógica compartilhada"
passaram a citar os três clientes. Dois bullets novos em Restrições: a regra de cor duplicada em
três arquivos (quem mexer em um mexe nos três) e as credenciais da congregação no keystore do
Android, nunca em log nem em debug, nem em teste.

**Pontos em Aberto / Resolvidos** — a exportação deixou de ser só `.xlsx` (inclui o S-13-T em
`.docx`); dois pontos novos registram a `DesignationsScreen` pendente e o fato de nenhuma tela do
app admin ter sido vista rodando (falta o JDK). O parágrafo "Resolvidos" ganhou a spec 0012.

## Arquivos modificados

- `AGENTS.md` — as seções acima.

## Arquivos criados

Nenhum arquivo de código. Só este README de implementação.

## Decisões técnicas

- **Descrever o estado real, não o estado planejado.** A Task 10 da spec (a `DesignationsScreen`)
  ainda não fechou quando esta task rodou, e `admin-app/src/presentation/App.tsx` renderiza um
  placeholder. O documento diz isso em dois lugares (Estrutura do Projeto e Pontos em Aberto) em vez
  de descrever a tela como pronta — a instrução da task era explícita sobre não inventar
  comportamento, e um `AGENTS.md` que descreve o futuro é pior que um desatualizado.
- **O aviso de HTTP não foi apagado, foi dividido.** Ele misturava três coisas: falta de TLS (hoje
  falsa), `FORWARDED_ALLOW_IPS`/rate limit (continua valendo) e backup do volume (continua valendo).
  Apagar o bloco inteiro levaria as duas verdades junto, então o texto novo diz que o proxy existe e
  mantém os dois avisos remanescentes como avisos separados, cada um com o seu ⚠️.
- **A coluna nova na tabela de Testes, em vez de uma tabela separada.** Cinco colunas ficam largas,
  mas a comparação lado a lado é o valor daquela tabela — é onde se vê que `admin-app/` usa o mesmo
  Jest do `app/` e a mesma exceção para a view nativa do MapLibre.
- **`admin-app/` na árvore entre `app/` e `admin/`.** Fora de ordem alfabética de propósito: os dois
  projetos React Native ficam vizinhos, e o Electron fecha o bloco.
- **Nada foi descrito sem leitura.** `docx-handler.ts`, `excel-export.ts`, `geocode.ts`,
  `ipc-handlers.ts`, `ipc-contract.ts`, `admin-app/README.md` e `admin-app/src/presentation/App.tsx`
  foram lidos antes de virarem texto — daí detalhes como o modelo `admin/resources/S-13_T_template.docx`,
  o casamento por número (e por nome quando não há número) no preview da importação, a criação de
  publicador pelo nome, a lista de erros que não aborta o lote, e o `null` silencioso do geocoder.

## Como validar

1. Ler o `AGENTS.md` e conferir que a Visão Geral tem quatro linhas na tabela e o parágrafo do que o
   app admin não faz.
2. Conferir que todo caminho de arquivo citado existe: `admin-app/src/domain/blockColor.ts`,
   `blockStatusLabel.ts`, `territoryMap.ts`, `admin-app/src/data/credentials-store.ts`,
   `session.ts`, `admin-app/src/presentation/map/AssignmentsMapView.tsx`,
   `admin/src/main/docx-handler.ts`, `excel-export.ts`, `geocode.ts`,
   `admin/resources/S-13_T_template.docx`.
3. `git diff --stat` deve mostrar apenas `AGENTS.md` entre os arquivos versionados que esta task
   tocou.

## Resultado da validação

- **Testes:** não se aplica — a mudança é só documentação, e nenhum arquivo de código foi tocado.
  Nenhuma suíte cobre o `AGENTS.md`.
- **Lint / type-check:** não se aplica pelo mesmo motivo.
- **Revisão manual:** feita. Todos os caminhos citados foram conferidos no disco antes de serem
  escritos; o bloco da árvore foi relido inteiro depois da edição para garantir que o desenho ASCII
  continua alinhado e que `admin/` segue sendo o último ramo (`└──`).
- **Escopo:** `git status` confirma que esta task modificou apenas `AGENTS.md` (as demais mudanças
  na árvore vêm das tasks anteriores da mesma spec).
