# Implementação 0249: Documentação, estado e evidências das campanhas (spec 0017, Task 09)

## O que foi feito
1. `AGENTS.md`: seção de modelo **Campaign** (tabelas, por que a linha de campanha mora em `territory_assignments`, o CHECK `ck_territory_assignments_author`, projeção nula), seção de regras **Campanhas** e a campanha na lista do que o app admin não faz.
2. `.centaur/state/campanhas.json` com as dez regras de `campanhas@1` implementadas, fontes e evidências.
3. Evidências executadas (`.centaur/evidence/`): pytest de serviço, rotas, repositório e integração para CMP-01..07; Vitest das exportações e telas do desktop para CMP-10; Jest completo do `app/` (CMP-08) e do `admin-app/` (CMP-09).

## Verificação
- Servidor: 722 testes, `app/services/` 100%, ruff limpo; `alembic upgrade/downgrade/upgrade` no banco dev.
- `admin/`: 608 testes, typecheck, lint e build verdes.
- `app/`: 146 testes, `tsc` limpo; lint com 2 erros `no-explicit-any` pré-existentes (`src/data/update-client.ts`, `src/domain/appUpdate.ts`).
- `admin-app/`: 341 testes, typecheck e lint limpos.
- `validate-lifecycle.py`: registros válidos; `--ready` só passa em CMP-01, as demais aguardam a integração das dependências (política conservadora).

## Pendências
- Verificação manual dos dois apps Android em emulador (JDK 17 ausente) e da página Campanhas no `npm run dev`.
- Integração (commit) e publicação conjunta de servidor + admins.
