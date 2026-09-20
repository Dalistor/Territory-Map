# [0226] Consulta móvel de histórico por publicador

**Data:** 2026-09-20
**Status:** Concluído
**Modo:** TDD
**Spec:** `.centaur/specs/0015/` — Task 18

## Solicitação

Implementar a tab somente-leitura `Publicadores` no admin Android, com busca local e o histórico
paginação de territórios retirados e devolvidos por cada pessoa.

## Contexto

No celular o responsável precisa consultar a trajetória de responsabilidade de um publicador sem
receber as ações administrativas de cadastro que continuam exclusivas do desktop.

## Critérios de aceite

- Lista publicadores com busca local e situação de identificação, sem ações de gestão.
- Abre o histórico no stack e consulta o servidor por `publisher_id`.
- Exibe território, retirada, devolução ou `Em andamento`, preservando o nome fotografado no
  histórico.
- Distingue busca sem resultado de pessoa sem designações; trata erro com nova tentativa e pagina.
- Mantém a tab montada sob o detalhe, preservando busca e posição ao voltar.

## Ciclos TDD

| # | Caso de teste | Arquivo de teste | Código que passou a existir |
|---|---------------|------------------|------------------------------|
| 1 | Busca local separa ausência de resultado da lista de pessoas | `admin-app/src/presentation/screens/PublishersScreen.test.tsx` | `PublishersScreen` somente leitura |
| 2 | Falha no catálogo permite tentar novamente | `admin-app/src/presentation/screens/PublishersScreen.test.tsx` | estado de erro recuperável |
| 3 | Pessoa sem designações recebe estado próprio | `admin-app/src/presentation/screens/PublishersScreen.test.tsx` | `PublisherHistoryScreen` |
| 4 | Histórico preserva nome e pagina para a próxima página | `admin-app/src/presentation/screens/PublishersScreen.test.tsx` | cartões de designação e paginação |
| 5 | Erro do histórico preserva a pessoa e repete a página | `admin-app/src/presentation/screens/PublishersScreen.test.tsx` | retry da consulta de histórico |

## O que foi feito

Foram criadas a lista de Publicadores e a tela empilhada de Histórico de territórios. A rota de
detalhe passa apenas id e nome serializáveis; a tab continua montada sob o stack, por isso sua
busca e sua posição não são reinicializadas no retorno.

## Arquivos modificados

- `admin-app/src/presentation/App.tsx` — conecta a tab e a rota `PublisherDetail` ao stack.
- `admin-app/src/presentation/App.test.tsx` — atualiza o fake da tab real.
- `admin-app/src/presentation/screens/index.ts` — exporta as novas telas.

## Arquivos criados

- `admin-app/src/presentation/screens/PublishersScreen.tsx` — catálogo de consulta de publicadores.
- `admin-app/src/presentation/screens/PublisherHistoryScreen.tsx` — períodos de responsabilidade por pessoa.
- `admin-app/src/presentation/screens/PublishersScreen.test.tsx` — testes comportamentais das duas telas.

## Decisões técnicas

O detalhe recebe somente `publisherId` e `publisherName` na rota para não passar `Date` nem outro
objeto não serializável ao React Navigation. O nome em cada linha vem da designação retornada pelo
servidor, não do catálogo atual do publicador, pois é o registro histórico correto.

## Como validar

```bash
cd admin-app && npx jest src/presentation/screens/PublishersScreen.test.tsx src/presentation/App.test.tsx --runInBand
cd admin-app && npm run lint
cd admin-app && npm run typecheck
```

## Resultado da validação

Os testes direcionados passaram: 21 testes em 2 suites; a suíte completa passou com 301 testes em
17 suites. A cobertura dos dois arquivos criados foi 100% de linhas e 75%/80,76% de branches,
cobrindo os caminhos de consulta, vazio, erro e paginação. Lint e typecheck passaram.
