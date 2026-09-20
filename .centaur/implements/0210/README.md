# [0210] Validação final dos clientes TypeScript e dos admins

**Data:** 2026-09-06
**Status:** Parcial — validação automatizada concluída; validação interativa bloqueada por falta de alvo
**Modo:** direto
**Spec:** `.centaur/specs/0014/` — Task 13

## Solicitação

Fazer a validação final sem otimização especulativa: executar testes, lint e typecheck dos três
clientes TypeScript; exercitar o admin mobile com dados representativos e profiler; verificar Android
em aparelho/emulador e o desktop com teclado, Escape, foco, larguras e clique nas quadras.

## Contexto

A Task 13 fecha as melhorias de UI da Spec 0014. A verificação automatizada está disponível, mas a
verificação interativa depende de um emulador/aparelho Android e de uma execução visual do desktop.

## O que foi feito

- Executados testes, lint e typecheck em `app/`, `admin-app/` e `admin/`.
- Confirmado por inspeção que a lista principal do admin mobile usa `ScrollView`; não foi observada
  medição nativa de lentidão nem justificativa para trocar por lista virtualizada.
- Confirmado que o ambiente não tinha emulador nem aparelho conectado em `adb devices`.
- Não executado Gradle nem alterado código de produção.
- Um teste transitório de profiler foi usado apenas para explorar a medição em Jest e removido após
  a execução; ele não substitui o profiler nativo nem a validação em aparelho.

## Arquivos modificados

- Nenhum arquivo de produto foi modificado por esta task.

## Arquivos criados

- `.centaur/implements/0210/README.md` — registro da validação e dos bloqueios ambientais.

## Decisões técnicas

Não houve troca de `ScrollView` por `FlatList`: sem emulador/aparelho e sem evidência observável de
custo de renderização, a otimização seria especulativa e contrariaria a instrução da task.

## Como validar

Nos diretórios dos clientes:

- `app`: `npm test -- --runInBand`, `npm run lint`, `npx tsc --noEmit`
- `admin-app`: `npm test -- --runInBand`, `npm run lint`, `npm run typecheck`
- `admin`: `npm test`, `npm run lint`, `npm run typecheck`

Com um aparelho/emulador Android conectado, executar o roteiro manual do README de `admin-app` e
usar o profiler nativo para rolagem, abertura de detalhe e mapa. No desktop, repetir a inspeção de
teclado, Escape, foco, janela larga/estreita e clique nas quadras.

## Resultado da validação

- `app`: 12 suítes e 114 testes aprovados; lint aprovado; typecheck aprovado.
- `admin-app`: 14 suítes e 278 testes aprovados; lint aprovado; typecheck aprovado.
- `admin`: 28 arquivos de teste e 549 testes aprovados; lint aprovado com 14 warnings de Prettier e
  0 erros; typecheck aprovado.
- O Jest do React Native emitiu warnings de `act`/plataforma Android já presentes no ambiente de
  testes, sem falha de teste.
- A verificação Android visual e o profiler nativo não foram executados: `adb devices` não listou
  alvo conectado. A verificação interativa do desktop também não foi executada nesta sessão.
