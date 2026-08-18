# [0093] Admin: modelo e contrato IPC de designação de território

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.claude/specs/0005/` — Task 13

## Solicitação

Spec 0005 — Task 13: em `admin/src/shared/models.ts`, adicionar `readonly assignedUser?:
PublisherBrief` à interface `Territory` (com comentário curto no estilo do arquivo). Em
`admin/src/shared/ipc-contract.ts`, adicionar o canal `territoriesAssign: 'territories:assign'` em
`IPC_CHANNELS` e o método `assign(territoryId: string, userId: string | null): Promise<Territory>`
em `IpcApi.territories`, com comentário curto explicando que `userId: null` remove a designação.
Escopo restrito a esses dois arquivos — sem handler nem chamada HTTP (Task 14, futura).

## Contexto

O servidor já expõe `PATCH /admin/territories/{id}/assignment` e devolve `assigned_user` em
`TerritoryOut` (Task 08 da mesma spec, implementação 0091). Esta task alinha o lado `shared/` do
admin (tipos e contrato IPC) a esse shape, antes de qualquer fiação de `main/`/`preload/`.

## O que foi feito

- `Territory` ganhou o campo opcional `assignedUser?: PublisherBrief`, reaproveitando a interface
  `PublisherBrief` já existente no mesmo arquivo (mesma usada em `WorkLog.publisher`), com comentário
  documentando que ausência significa "sem designação".
- `IPC_CHANNELS` ganhou `territoriesAssign: 'territories:assign'`, ao lado dos demais canais de
  `territories:*`.
- `IpcApi.territories` ganhou `assign(territoryId, userId)`, com comentário explicando o
  `userId: null` como remoção da designação — mesmo estilo dos comentários já presentes nos outros
  métodos da interface.

Nenhum handler (`main/ipc-handlers.ts`), cliente HTTP (`main/api-client.ts`) ou implementação de
preload foi tocado — isso é a Task 14.

## Arquivos modificados

- `admin/src/shared/models.ts` — campo `assignedUser?: PublisherBrief` em `Territory`.
- `admin/src/shared/ipc-contract.ts` — canal `territoriesAssign` em `IPC_CHANNELS` e método
  `assign` em `IpcApi.territories`.

## Decisões técnicas

- `PublisherBrief` (já existente) foi reaproveitado em vez de criar um tipo novo, pois o shape
  (`id` + `name`) é idêntico ao que o servidor devolve em `assigned_user` (`UserBriefOut`).
- O campo é opcional (`?`), não `| null`, seguindo a convenção já usada no arquivo para "ausência
  de dado" em vez de presença explícita de nulo (ex.: `Block.lastWorkedAt?`).

## Como validar

```bash
cd admin && npx tsc --noEmit -p .
npx vitest run src/shared
npx eslint src/shared/models.ts src/shared/ipc-contract.ts
```

## Resultado da validação

- `tsc --noEmit`: sem erros.
- `vitest run src/shared`: 5 arquivos de teste, 64 testes, todos passando (nenhum teste novo era
  esperado — mudança é só de tipos/contrato, sem comportamento, conforme escopo da task).
- `eslint`: sem warnings nos dois arquivos.
