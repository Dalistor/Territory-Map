# [0072] Remover `packages/core` (Dart) e seu workflow de CI

**Data:** 2026-08-17
**Status:** Concluído
**Modo:** direto
**Spec:** `.centaur/specs/0005/` — Task 12

## Solicitação

Remover o diretório `packages/core/` inteiro e o arquivo `.github/workflows/core.yml` (o workflow
de CI que só existia para testar aquele pacote), sem tocar em mais nada — o `AGENTS.md` fica para a
Task 27 — e confirmar com `grep -rn "packages/core"` que não sobrou referência em código ativo.

## Contexto

A spec 0005 troca a stack do app de Flutter (Dart) para React Native (TypeScript). `packages/core`
era o pacote Dart compartilhado, exclusivo do app antigo — sem app Flutter, não há mais consumidor,
e o CI que só existia para testá-lo (`.github/workflows/core.yml`) perde sentido junto.

## O que foi feito

1. **`packages/core/` já não existia no working tree.** Ao investigar, descobri que o diretório
   inteiro (`pubspec.yaml`, `lib/`, `test/`, etc.) já havia sido apagado no commit `01f8207` ("MVP
   admin"), anterior a esta task, e não está mais rastreado pelo git (`git ls-files | grep
   ^packages/` não retorna nada). Não havia nada a remover nessa frente — já era um fato consumado,
   apenas não documentado como tal.
2. **Removido `.github/workflows/core.yml`** (`git rm`). Esse arquivo continuava no repositório
   mesmo com `packages/core` já apagado, e além de testar o pacote Dart, também rodava
   `flutter analyze`/`flutter test` sobre `admin/` — um resquício do admin em Flutter, que já foi
   substituído por Electron. O workflow estava completamente obsoleto nas duas frentes.

## Arquivos removidos

- `.github/workflows/core.yml` — CI do pacote Dart `packages/core` e do admin em Flutter (ambos já
  não existem no repositório).

## Decisões técnicas

- Não recriei nem toquei em `packages/core/` — já estava ausente do working tree e do índice do
  git antes desta task; misturar uma "remoção" que já tinha acontecido noutro commit não muda o
  resultado, só evitei reportar um trabalho que não foi feito aqui.
- Segui a instrução de escopo à risca: nenhuma outra mudança fora dessas duas remoções.

## Como validar

```bash
git ls-files | grep '^packages/'      # vazio — nada rastreado
ls packages/core 2>&1                  # No such file or directory
ls .github/workflows/core.yml 2>&1     # No such file or directory
grep -rn "packages/core" . 2>/dev/null | grep -v '^\./\.git/'
```

## Resultado da validação

`git ls-files | grep '^packages/'` não retorna nada, e o diretório não existe no disco — confirmado.
`.github/workflows/core.yml` removido (`git rm`, staged for commit).

O `grep -rn "packages/core"` na raiz (fora de `.git/`) ainda encontra referências em:

- **`AGENTS.md`** — esperado pela própria instrução da task; fica para a Task 27.
- **`.centaur/implements/*` e `.centaur/specs/*`** — documentação histórica de implementações e specs
  passadas (registros do que já aconteceu, ex. `.centaur/implements/0025/README.md` sobre a criação
  original do pacote). Não é código ativo; reescrever histórico não é o objetivo desta task.
- **Comentários em código do admin** (`admin/src/shared/api-errors.ts`, `admin/src/shared/models.ts`,
  `admin/src/shared/geo.ts`, `admin/src/shared/geo.test.ts`, `admin/src/main/api-client.ts`) — são
  comentários de linhagem ("ported from `packages/core/...`"), documentando de onde a lógica
  TypeScript foi originalmente portada. Nenhum desses arquivos importa, referencia caminho ou
  depende de `packages/core` para funcionar — são apenas notas históricas dentro de comentários.

Nenhum arquivo de configuração (`package.json`, `tsconfig*.json`, `pubspec.yaml` — que, aliás, não
existe em lugar nenhum do repositório hoje, já que o app novo em React Native ainda não foi
scaffoldado pela Task 16) referencia `packages/core` como dependência ou caminho de build. Nenhuma
referência funcional/ativa restante — apenas documentação histórica e comentários de lineage, ambos
fora do escopo desta task.

Sem testes ou lint aplicáveis: a mudança é puramente estrutural (remoção de um workflow YAML), sem
código-fonte de nenhuma das camadas do projeto envolvido.
