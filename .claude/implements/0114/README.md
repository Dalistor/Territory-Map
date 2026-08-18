# [0114] Instalador macOS do admin: identidade do bundle, `.env` empacotado e ordenação por número

**Data:** 2026-08-18
**Status:** Concluído
**Modo:** direto (empacotamento/config) + TDD (ordenação por número do território)
**Spec:** — (pedido direto do usuário: "Pode gerar o instalador disso para o mac agora?", e no meio
do processo "a ordenação por número está falha também, o 12 está fora de ordem")

## Solicitação

Gerar o instalador macOS do admin. Durante o processo o usuário apontou, por screenshot, que
"Próximo ao centro - N12" aparecia entre "Centro - N6" e "Santa Helena - N 7" na lista.

## O que foi encontrado (e por que o primeiro instalador era inútil)

Empacotar não era só rodar o comando — três problemas apareceram, um deles fatal:

1. **O app empacotado não abria.** `main/index.ts` lia o `.env` de `join(__dirname, '../../.env')`,
   que em produção resolve para `app.asar/.env` — caminho que **não pode existir**, já que o
   `.env` é excluído do pacote por `files` no `electron-builder.yml`. `requireEnv('API_BASE_URL')`
   lançava e o processo morria antes de criar a janela. Confirmado empiricamente: `asar list` sem
   `/.env`, e o processo saindo em segundos (0 processos vivos) contra os 4 processos saudáveis
   depois da correção.
2. **Identidade do bundle era a do scaffold**: `productName: admin` (o app apareceria como
   "admin" no Finder/Launchpad) e `appId: com.electron.app`.
3. **Info.plist prometia permissões que o app nunca pede** (câmera, microfone, Documentos,
   Downloads), herdadas do template.

## O que foi feito

**Empacotamento** (`electron-builder.yml`, `src/main/index.ts`):
- `productName: Territory Map Admin`, `appId: com.dalistor.territory-map-admin`,
  `category: public.app-category.productivity`.
- Removidas as quatro `NSUsageDescription` do scaffold — declarar motivo de uma permissão que
  nunca é pedida é uma promessa que o app não cumpre.
- `extraResources` copia `admin/.env` para `Contents/Resources/.env`, e o main process resolve o
  caminho por `app.isPackaged`: `process.resourcesPath` empacotado, `__dirname/../../.env` em dev.
  Fica **fora do asar** de propósito: apontar uma instalação para outro servidor passa a ser uma
  edição de texto, não um rebuild. A mensagem de erro do `requireEnv` passou a citar o caminho
  real e a lembrar que o arquivo é copiado no build.
- `admin/README.md` documenta esse comportamento e que preencher o `.env` antes de empacotar
  deixou de ser opcional.

**Ordenação por número** (`shared/models.ts`, `HomeScreen.tsx`) — por TDD:
- `territoryNumber(name)`: lê a **última** sequência de dígitos do nome, então "Cambé 3 - N1" dá 1
  (e não 3) e "Santa Helena - N 7" dá 7 mesmo com o espaço depois do N.
- `compareTerritoriesByNumber(a, b)`: ordena pelo número; o nome só desempata; nomes sem número
  vão para o fim (são legado — o editor agora exige o número, implements/0113).
- A correção anterior (0113) usava `localeCompare(..., { numeric: true })`, que ordenava pelo
  **nome** e só usava o número para desempatar dentro do mesmo prefixo — daí o N12 cair entre N6 e
  N7. Este é o conserto de verdade.

## Arquivos modificados

- `admin/electron-builder.yml` — identidade do bundle, `extraResources`, limpeza do `extendInfo`
- `admin/src/main/index.ts` — resolução do `.env` por `app.isPackaged`
- `admin/src/shared/models.ts` — `territoryNumber` e `compareTerritoriesByNumber`
- `admin/src/shared/models.test.ts` — 8 testes novos das duas funções
- `admin/src/renderer/screens/HomeScreen.tsx` — passa a ordenar pelo número
- `admin/src/renderer/screens/HomeScreen.test.tsx` — regressão com os dados reais (N6/N7/N12)
- `admin/README.md` — seção de empacotamento

## Como validar

```bash
cd admin && npm test && npm run typecheck && npm run lint
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac
open dist/territory-map-admin-1.0.0.dmg
```

## Resultado da validação

- `npm test` → **345 verdes** (19 arquivos); `typecheck` e `lint` limpos.
- `npm run build:mac` → `dist/territory-map-admin-1.0.0.dmg` (114 MB) e
  `dist/Territory Map Admin-1.0.0-mac.zip` (113 MB), arch **x64** (esta máquina é Intel,
  `uname -m` = `x86_64`).
- Bundle conferido: `CFBundleName = Territory Map Admin`,
  `CFBundleIdentifier = com.dalistor.territory-map-admin`, `icon.icns` presente,
  `Contents/Resources/.env` presente.
- App empacotado executado: **fica vivo** (4 processos: main, GPU, renderer, rede), contra morrer
  em segundos antes da correção. A conferência visual da janela ficou com o usuário — forçar foco
  exigiria conceder permissão de Acessibilidade a um script, o que não foi feito.
- **Sem assinatura de código** (não há certificado): o Gatekeeper vai avisar "desenvolvedor não
  identificado" na primeira abertura, comportamento já documentado no `admin/README.md`.
