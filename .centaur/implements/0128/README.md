# [0128] Admin/Shared: contrato IPC da listagem geral de designações (spec 0008, Task 05)

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0008/` — Task 05

## Solicitação
> Spec 0008 — Task 05: Em `admin/src/shared/models.ts`, adicione a interface
> `AssignmentWithTerritory` estendendo `Assignment` com
> `readonly territory: { readonly id: string; readonly name: string }` — comentário curto dizendo
> que é o formato da listagem geral do histórico, em que cada registro precisa nomear seu
> território (na listagem por território isso já estava no contexto). Em
> `admin/src/shared/ipc-contract.ts`, acrescente o canal `assignmentsListAll: 'assignments:listAll'`
> em `IPC_CHANNELS` e o método `listAll(): Promise<AssignmentWithTerritory[]>` no namespace
> `assignments` de `IpcApi`, com comentário dizendo que devolve o histórico inteiro da congregação,
> mais recente primeiro. Não remova nem altere nada existente — diferente da spec 0007, esta task
> só acrescenta, então a compilação continua verde. Valide com `npm run typecheck` (deve ficar
> **limpo**) e `npx vitest run src/shared`. Toque apenas `admin/src/shared/models.ts` e
> `admin/src/shared/ipc-contract.ts`.

## Contexto
A página de Histórico (Task 07) precisa de todas as designações da congregação numa chamada só,
com o território embutido para poder agrupar e para montar a URL de apagar
(`DELETE /admin/territories/{territory_id}/assignments/{assignment_id}`, que exige o território no
caminho). O `shared/` do admin é onde main e renderer combinam esse formato e o nome do canal.

## O que foi feito
- `AssignmentWithTerritory extends Assignment` em `models.ts`, acrescentando apenas
  `territory: { id, name }`, com comentário explicando por que a listagem geral precisa nomear o
  território e a por território não.
- Canal `assignmentsListAll: 'assignments:listAll'` em `IPC_CHANNELS`, logo abaixo do
  `assignmentsListFor`.
- Método `listAll(): Promise<AssignmentWithTerritory[]>` no namespace `assignments` de `IpcApi`,
  com o comentário sobre o histórico inteiro da congregação, mais recente primeiro.
- O `import type` de `./models` no `ipc-contract.ts` passou a trazer também
  `AssignmentWithTerritory` (quebrado em múltiplas linhas pelo Prettier).

Nada existente foi removido ou alterado.

## Arquivos modificados
- `admin/src/shared/models.ts` — nova interface `AssignmentWithTerritory`
- `admin/src/shared/ipc-contract.ts` — canal `assignmentsListAll`, método `assignments.listAll` e
  o import do tipo novo

## Arquivos criados
Nenhum.

## Decisões técnicas
- **`extends Assignment` em vez de repetir os campos**: o registro é o mesmo do histórico por
  território, só com o território junto; herdar deixa isso explícito e evita que os dois formatos
  divirjam.
- **`territory` como objeto inline `{ id, name }`**, não um tipo nomeado: espelha exatamente o
  `TerritoryBriefOut` do servidor (Task 01) e é o único lugar do admin que precisa desse par; um
  tipo exportado só para ele custaria nome sem ganho. Se aparecer um segundo uso, aí vale extrair.
- **`listAll` obrigatório na `IpcApi`, não opcional**: a interface é justamente o portão que faz
  faltar um handler ou um forwarder virar erro de compilação. Torná-lo opcional para manter o
  typecheck verde agora esvaziaria a garantia que as Tasks 06–08 dependem dela.

## Desvio em relação à instrução da task
A task previa `npm run typecheck` **limpo**, o que não é alcançável tocando só os dois arquivos de
`shared/`: `preload/index.ts` implementa a `IpcApi` inteira e seis testes de tela fabricam um
`window.api` completo, então acrescentar um método **obrigatório** à interface deixa esses arquivos
incompletos por construção. Foi testado adicionar o forwarder no preload (fora do escopo declarado)
e mesmo assim os testes de tela continuavam vermelhos — ou seja, não é um arquivo esquecido, é o
efeito esperado de ampliar o contrato. Optou-se por respeitar o escopo da task e deixar a
compilação vermelha até as tasks que preenchem os dois lados da ponte:
- `src/preload/index.ts` → Task 06 (que já manda expor `assignments.listAll`)
- `src/renderer/App.test.tsx`, `screens/BlockEditorScreen.test.tsx`,
  `screens/DesignationsScreen.test.tsx`, `screens/HomeScreen.test.tsx`,
  `screens/SetupScreen.test.tsx`, `screens/TerritoryEditorScreen.test.tsx` → fakes de `window.api`,
  atualizados nas Tasks 07/08 (a Task 08 já prevê acrescentar `assignments.listAll` ao fake).

Mesma situação que a spec 0007 teve ao mudar o contrato: verde volta quando a onda seguinte fecha.

## Como validar
```bash
cd admin
npx vitest run src/shared   # regras puras de shared/
npm run typecheck           # limpo só depois das Tasks 06 a 08
```

## Resultado da validação
- `npx vitest run src/shared` — **5 arquivos, 74 testes, todos passando**.
- `npx eslint src/shared` — **sem saída** (limpo).
- `npm run typecheck` — falha esperada e localizada: `preload/index.ts` e os seis testes de tela
  citados acima, todos por falta do `listAll` nos fakes/forwarder. Nenhum erro nos arquivos
  tocados.
