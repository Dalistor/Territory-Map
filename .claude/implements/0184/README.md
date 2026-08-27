# [0184] Remover do README do app admin o aviso de navegação não ligada

**Data:** 2026-08-23
**Status:** Concluído
**Modo:** direto

## Solicitação

> Apague o item "A navegação ainda não está ligada" de admin-app/README.md (linhas 170-174):
> App.tsx não é mais placeholder, o bootstrap da Task 08 e a DesignationsScreen da Task 10 foram
> implementados e estão cobertos por teste. O próprio item pedia para ser removido quando as duas
> tasks fechassem.

## Contexto

O item saiu da Task 13 da spec 0012 (`implements/0180`), que escreveu o `README.md` do
`admin-app/`. Naquele momento ele era verdade: `src/presentation/App.tsx` ainda era o placeholder
que a Task 01 tinha deixado, e nem o bootstrap de navegação (Task 08) nem a `DesignationsScreen`
(Task 10) existiam. A Task 13 registrou o fato como limitação datada, com a instrução explícita de
apagá-lo quando as duas fechassem.

As duas fecharam depois — Task 08 em `implements/0181` e Task 10 em `implements/0183` —, e a
Task 13 não tinha como voltar para limpar o que ela mesma marcou como temporário. Resultado: o
README passou a afirmar que quem abrisse o app veria só um placeholder, o que deixou de ser
verdade. Documentação errada sobre o estado do projeto é pior que documentação ausente, porque
quem lê acredita.

## O que foi feito

Removido o quarto item da seção "Limitações conhecidas" do `admin-app/README.md` — as cinco linhas
do bullet inteiro, incluindo a própria instrução "Apagar este item quando as duas tasks fecharem".

Os outros três itens da seção continuam válidos e foram mantidos intactos: a `AssignmentsMapView`
sem teste automatizado (com o passo manual pendente em emulador), o `.env` lido só em tempo de
build, e a ausência de fila offline e de cache de leitura.

## Arquivos modificados

- `admin-app/README.md` — removido o item "A navegação ainda não está ligada" da seção "Limitações
  conhecidas"

## Arquivos criados

Nenhum.

## Decisões técnicas

**Removido, não reescrito.** A alternativa seria transformar o item em "a navegação está ligada",
mas uma seção chamada "Limitações conhecidas" não é lugar para registrar o que funciona. O que a
navegação faz já está descrito nas seções de estrutura e de uso do próprio README.

**Nada foi acrescentado sobre o passo manual em emulador.** Ele já está no primeiro item da seção,
preso ao `AssignmentsMapView`, e continua pendente pela falta do JDK 17 — repeti-lo aqui criaria
duas fontes para o mesmo aviso.

**O `CLAUDE.md` não foi tocado.** Foi conferido antes: a Task 10 escreveu nele por último e já
descreve o app admin completo, sem menção a placeholder ou a tela pendente. A correção era só do
README do `admin-app/`.

## Como validar

```bash
grep -n -i "placeholder\|não está ligada" "admin-app/README.md"
```

Não deve retornar nada. E a afirmação contrária se confere no código:

```bash
grep -n "DesignationsScreen\|SetupScreen\|NavigationContainer" admin-app/src/presentation/App.tsx
```

## Resultado da validação

- `grep` por "placeholder", "ainda não foram implementad" e "não está ligada" no
  `admin-app/README.md` → **nenhuma ocorrência**.
- Antes de apagar, a afirmação foi conferida como falsa no código: `App.tsx` importa
  `DesignationsScreen` (linha 42) e `SetupScreen` (linha 43), e os renderiza dentro de um
  `NavigationContainer` (linha 262).
- `npx jest src/presentation/App.test.tsx src/presentation/screens/DesignationsScreen.test.tsx` →
  **2 suítes, 28 testes passando** — as duas telas que o item dizia não existirem estão cobertas.
- Mudança exclusivamente de documentação: nenhum arquivo de código foi tocado, então lint,
  type-check e a suíte completa (208 testes) permanecem como estavam ao fim da spec 0012.
