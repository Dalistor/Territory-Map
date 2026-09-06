# [0023] Deploy automático da branch main na VPS de produção

**Data:** 2026-08-02
**Status:** Concluído
**Modo:** direto

## Solicitação

> "Antes já vamos colocar o servidor e banco de dados para rodar. Já estou com o servidor aberto,
> mas ele está virgem ainda. Preciso que me passe o comando para gerar uma chave ssh para lá. E ent
> instale as dependencias necessárias e o prepare para o deploy"

## Contexto

A Task 22 da spec 0001 já tinha escrito `.github/workflows/server.yml` com um job de deploy, mas ele
nunca havia rodado contra uma VPS real. O run do commit `c160eb6` **falhou** — o que confirmou dois
defeitos que só apareceriam no primeiro deploy de verdade.

## O que foi feito

**Gatilho:** push na `main` (ou `workflow_dispatch`), depois do job de testes passar.
**Transporte:** a aplicação vai como **imagem no GHCR**, construída pelo runner. Só o
`docker-compose.yml` e o `docker/postgres/init/` viajam por rsync.
**Na VPS:** `docker compose pull && up -d && image prune -f`.
**Verificação:** health check por dentro da VPS contra `127.0.0.1:$API_PORT/health`, 30 tentativas
de 5s, despejando `compose ps` e `compose logs --tail 50` se falhar.

### Os dois defeitos corrigidos

1. **O compose nunca chegava na VPS.** O job rodava `docker compose pull` em `DEPLOY_PATH`, mas
   nada colocava o `docker-compose.yml` lá — nem o `docker/postgres/init/`, que o compose monta
   como bind volume. O primeiro deploy morreria com "no configuration file".
2. **Deploy verde com API morta.** Não havia health check: `docker compose up -d` retorna assim que
   o container é criado, não quando a aplicação responde.

### Melhorias trazidas do template da skill

- **Host key fixada** por `SSH_KNOWN_HOSTS`. O `appleboy/ssh-action` anterior aceitava qualquer
  host key.
- **`~/.ssh/config` com `BatchMode yes`** — sem isso um problema de chave vira job pendurado até o
  timeout em vez de falhar na hora.
- **Environment `production` restrito à `main`**, com checagem explícita de valor vazio no primeiro
  step (o erro mais comum desta configuração é secret cadastrado fora do Environment).
- **`workflow_dispatch` com `dry_run`**, que simula o rsync e pula build, rollout e health check.

## Arquivos modificados

- `.github/workflows/server.yml` — `workflow_dispatch` com `dry_run`; job `build-and-deploy` com
  `environment: production`, `timeout-minutes: 30`, setup de SSH, checagem de pré-requisitos, sync
  do compose, rollout, health check e limpeza das credenciais do runner
- `server/README.md` — seção de secrets/variables reescrita com os nomes novos, valores reais,
  rotação e revogação

## Configuração fora do repositório

- **GitHub Environment `production`**, restrito à branch `main`
  - Secrets: `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`
  - Variables: `SSH_HOST=76.13.160.146`, `SSH_USER=root`, `SSH_PORT=22`,
    `DEPLOY_PATH=/opt/territory-map`
- **Chave SSH:** `~/.ssh/territory_map_deploy` (ed25519, sem passphrase, dedicada ao deploy) na
  máquina do dev; pública em `~/.ssh/authorized_keys` da VPS
- **Na VPS:** Docker 29.7.1 + Compose v5.3.1, `/opt/territory-map/.env` criado à mão (fora do Git),
  com `POSTGRES_PASSWORD` e `JWT_SECRET` gerados por `openssl rand` na própria VPS — os valores
  nunca passaram pelo chat

## Decisões técnicas

**Imagem do GHCR em vez de rsync do código.** O padrão da skill é rsync do repositório inteiro, mas
aqui o runner já constrói e publica a imagem com cache de layers. Enviar o código-fonte também
deixaria duas cópias na VPS e um build redundante lá.

**`--delete` escopado a `docker/`.** Dois rsync separados: o `docker-compose.yml` é arquivo único e
vai sem `--delete`; o `docker/` é espelhado com `--delete` para que script de init removido do repo
suma da VPS. Como o `.env` mora um nível acima, ele está fora do alcance do `--delete` por
construção, não por `--exclude`.

**Host, usuário e porta como variables, não secrets.** Eles aparecem no log, e é isso que torna uma
falha de conexão legível. Só a chave privada e o known_hosts são sensíveis.

**`root` como usuário do deploy**, decidido com o usuário. Um usuário dedicado no grupo `docker`
seria mais limpo para auditoria, mas não reduz privilégio de verdade: quem está no grupo `docker`
consegue virar root montando o filesystem do host num container.

## Auditoria do `--delete`

`rsync --dry-run -i` rodado contra a VPS real, com a chave de deploy, antes de qualquer escrita:

```
created directory /opt/territory-map/docker
cd+++++++ ./
cd+++++++ postgres/
cd+++++++ postgres/init/
<f+++++++ postgres/init/20-create-databases.sh
<f+++++++ docker-compose.yml
```

**Nenhuma linha `*deleting`.** Só criação. Confirmado depois do deploy real que o `.env` continua
com os mesmos 537 bytes e permissão `600`.

## O que o deploy NÃO faz

- **Segredos da VPS** — o `.env` nunca é enviado nem sobrescrito. Mudar `JWT_SECRET` ou
  `POSTGRES_PASSWORD` é manual e exige `docker compose up -d` na mão.
- **Rollback** — não existe. Voltar é reverter o commit e deixar o push disparar de novo. Para
  voltar rápido sem CI, dá para fixar `API_IMAGE=ghcr.io/dalistor/territory-map-server:<sha>` no
  `.env` da VPS e subir.
- **TLS / proxy reverso** — a API está exposta em `0.0.0.0:8000` em **HTTP puro**. Não há nginx nem
  certificado. Ver "Pendências".
- **Backup do banco** — o volume `postgis_data` não é copiado por ninguém.
- **Migrations** já rodam sozinhas: o entrypoint da imagem executa `alembic upgrade head` antes do
  uvicorn. Uma migration destrutiva sobe junto com o deploy, sem confirmação.

## Como revogar

```bash
ssh root@76.13.160.146 "grep -v 'github-actions-territory-map-main' ~/.ssh/authorized_keys > /tmp/ak && mv /tmp/ak ~/.ssh/authorized_keys"
```

```bash
gh secret delete SSH_PRIVATE_KEY -R Dalistor/Territory-Map --env production
```

Rotacionar é gerar uma chave nova com outro nome, instalar na VPS, atualizar o secret e revogar a
antiga.

## Como validar

- Ensaio sem tocar na VPS: Actions → `server` → Run workflow → marcar `dry_run`
- Deploy real: push na `main`
- `gh run watch -R Dalistor/Territory-Map <run-id>`

## Resultado da validação

- YAML validado (`yaml.safe_load`); `actionlint` não está instalado nesta máquina
- Conexão SSH testada com `IdentitiesOnly=yes` e `BatchMode=yes` antes de qualquer mudança
- Fingerprint do host conferido contra `/etc/ssh/ssh_host_ed25519_key.pub` pelo canal já
  autenticado: `SHA256:LQSTLYTOjWqh1mjHwVdq4P8dvwAIlA3ulrc+O2ATvcU` — bate com o `ssh-keyscan`
- Run `30765918226` verde nos 12 steps, health check incluído
- Na VPS: `api` e `db` (healthy) de pé, `/health` em **HTTP 200**, e as 5 tabelas mais
  `alembic_version` criadas pelas migrations do entrypoint

## Pendências

1. **HTTP puro na porta 8000, aberto para a internet.** O JWT do admin e o token do app trafegam em
   texto claro. Antes de qualquer uso real, colocar um proxy reverso com TLS na frente e fechar a
   8000 no firewall.
2. **`--proxy-headers` com `FORWARDED_ALLOW_IPS` restrito ao loopback** (default posto na Task 22).
   Ao introduzir o proxy, apontar essa variável para o IP dele, senão o rate limit por IP passa a
   ver sempre o mesmo endereço.
3. **Sem backup do volume `postgis_data`.**
