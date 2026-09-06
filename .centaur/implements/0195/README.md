# [0195] Migração da documentação legada Claude para Centaur

**Data:** 2026-09-05
**Status:** Concluído
**Modo:** direto

## Solicitação

Migrar a documentação existente em `CLAUDE.md` e `.claude/` para `AGENTS.md` e `.centaur/`,
importando o histórico e removendo os arquivos legados.

## Contexto

O projeto já estava documentado, mas usava a estrutura legada `CLAUDE.md`/`.claude`. O usuário
confirmou o propósito, o status em uso com dados reais, a arquitetura de camadas, os testes, o
vocabulário, o ambiente e a decisão de renomear a documentação sem perder o histórico.

## O que foi feito

- `CLAUDE.md` foi renomeado para `AGENTS.md`.
- `.claude/` foi renomeada para `.centaur/`, preservando as 194 implementações e 13 specs.
- Referências textuais a `CLAUDE.md` e `.claude` foram atualizadas para `AGENTS.md` e `.centaur`.
- O `AGENTS.md` recebeu o carimbo do schema `1.5.0`.
- Este registro foi adicionado ao histórico de implementações.
- Os nomes legados foram removidos.

## Arquivos modificados

- `AGENTS.md`
- `.centaur/implements/status.md`
- `.centaur/implements/0195/README.md`
- Referências documentais em READMEs, exemplos e comentários existentes

## Decisões técnicas

O conteúdo de `CLAUDE.md` foi preservado como base de `AGENTS.md`, incluindo as camadas confirmadas:
servidor por models, schemas, repositories, services, routers/core/jobs; admin Electron separado
entre main, preload e renderer; e os apps React Native separados entre Presentation, Domain e Data.
O histórico foi movido, não recriado, para manter os vínculos entre specs e implementações.

## Como validar

```bash
rg -n 'CLAUDE\\.md|\\.claude' --glob '!**/node_modules/**' --glob '!**/.git/**' .
git status --short
```

## Resultado da validação

- Nenhuma referência a `CLAUDE.md` ou `.claude` permanece no projeto.
- `AGENTS.md`, `.centaur/implements/status.md` e `.centaur/specs/index.md` existem.
- O histórico importado contém as implementações e specs anteriores.
- Nenhum arquivo de código executável foi alterado por comportamento.
