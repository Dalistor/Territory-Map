# Implementação 0239: Documentação e fluxo de deploy das releases na VPS (spec 0016, Task 08)

## O que foi feito
1. Atualizado `AGENTS.md` com a especificação de auto-atualização in-app para ambos os aplicativos Android, cobrindo o fluxo de checagem, semântica de versões obrigatórias/opcionais, download com feedback de progresso e instalador nativo via `FileProvider`.
2. Atualizado `server/README.md` documentando os novos endpoints (`GET /updates/latest` e `GET /updates/download/{app}`), a estrutura do diretório `/opt/territory-map/releases/` na VPS, o esquema do manifesto `version.json` e instruções para envio via SCP.
3. Atualizados `app/README.md` e `admin-app/README.md` com instruções passo a passo para incremento do `versionCode`/`versionName`, compilação do APK release com Gradle e publicação na VPS.
4. Adicionado mapeamento de volume `./releases:/app/releases` em `docker-compose.yml` para persistência dos APKs e manifestos de atualização na VPS.

## Arquivos Afetados
- `AGENTS.md`
- `docker-compose.yml`
- `server/README.md`
- `app/README.md`
- `admin-app/README.md`

## Verificação
- Verificação cruzada de todos os caminhos, endpoints e esquemas nos quatro documentos.
