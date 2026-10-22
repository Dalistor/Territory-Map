# Implementação 0253: Auditoria visual dos três clientes e alinhamento de tokens (spec 0018, Task 01 + coordenação)

## O que foi feito
1. Auditoria `design-taste-frontend` (caminho de review, `references/app-screens.md`) dos três clientes em `.centaur/specs/0018/audit.md`: 213 achados (app 46, admin-app 86, admin 81), três mudanças de maior efeito por cliente, 24 mudanças de hábito (H1–H24) e tokens faltantes. O inspector rodou no admin desktop num Vite temporário fora do repositório, com `window.api` falso; os apps Android foram auditados pelo código.
2. Aprovação do usuário (2026-10-22) das mudanças de hábito: app — "Designados no topo", "Renomear rótulos" (H1, abrir direto no mapa, recusado); admin-app — todas; desktop — "Títulos e nomes", "Menos ruído", "Diálogos próprios" ("Uma ação principal" recusado).
3. Coordenação: `text-secondary` passou a `#5A6B83` no `DESIGN.md` e nos dois `theme.ts` Android, acompanhando o desktop (o valor antigo dava 4,45:1 sobre `primary-soft`); `UX-CONTRACT.md` lista a aba Campanhas do app admin.

## Arquivos Afetados
- `.centaur/specs/0018/audit.md`, `DESIGN.md`, `UX-CONTRACT.md`, `app/src/presentation/theme.ts`, `admin-app/src/presentation/theme.ts`

## Verificação
- `app/` 148 testes, `admin-app/` 342, `admin/` 608 + typecheck e lint, após o alinhamento.
