# [0214] Controles compartilhados de consulta no desktop

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0015/` — Task 09

## Solicitação

Criar primitivas compartilhadas do renderer para busca, seleção segmentada e tabela de consulta,
com estados estáveis e testes de interação essenciais.

## Contexto

As próximas telas de Territórios, Publicadores e Histórico completo precisam usar a mesma gramática
de busca, alternância de visualização, ordenação e recuperação de falha. Sem essas primitivas, cada
superfície tenderia a introduzir comportamento e acessibilidade próprios.

## O que foi feito

- Criado `SearchField`, com rótulo associado, botão Limpar desabilitado quando vazio e retorno de
  foco ao campo após a limpeza.
- Criado `SegmentedControl`, com `radiogroup`, seleção anunciada e alternância por setas entre
  opções disponíveis.
- Criado `DataTable` semântico, com cabeçalhos ordenáveis, seleção e ativação por teclado da linha,
  scroll interno e estados de carregamento, vazio, sem resultados e erro recuperável sem remover a
  estrutura da tabela.
- Aplicados os tokens semânticos do shell desktop e testes das interações fundamentais.

## Arquivos criados

- `admin/src/renderer/components/SearchField.tsx` — campo de busca acessível.
- `admin/src/renderer/components/SegmentedControl.tsx` — escolha única segmentada.
- `admin/src/renderer/components/DataTable.tsx` — tabela de leitura reutilizável.
- `admin/src/renderer/components/query-controls.css` — estilos locais dos controles e tabela.
- `admin/src/renderer/components/query-controls.test.tsx` — cobertura de limpeza, segmentos,
  ordenação, teclado e recuperação de erro.

## Decisões técnicas

Os componentes recebem dados, estado e callbacks das telas, sem consultar `window.api` nem conhecer
filtros de domínio. A tabela mantém o cabeçalho durante estados sem linhas e delega a ordenação para
a tela, evitando sugerir uma ordenação global quando ela for apenas da página carregada.

## Como validar

```bash
cd admin
npm test -- --run src/renderer/components/query-controls.test.tsx
npm run typecheck
npm run lint
```

## Resultado da validação

- Teste específico: 4 testes passaram.
- Suíte completa do admin: 29 arquivos e 553 testes passaram.
- Typecheck: passou.
- Lint: sem erros; 14 avisos Prettier preexistentes em `Dialog.tsx`, `HomeScreen.tsx` e
  `PublishersScreen.tsx`, fora do escopo desta task.
- `git diff --check` para os componentes: passou.
