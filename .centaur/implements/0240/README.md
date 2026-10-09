# Implementação 0240: Correção do toque sobre o número da quadra nos mapas MapLibre

## O que foi feito
1. Identificado que no MapLibre Native para Android (`@maplibre/maplibre-react-native`), toques sobre visualizações nativas de marcadores (`Marker`) são interceptados nativamente pelo `MLRNMapView` antes da detecção de polígonos GeoJSON (`hitbox`).
2. Como o componente `<Marker>` não possuía o handler `onPress` atribuído diretamente (o handler estava apenas no `<Pressable>` filho, cujo evento era engolido pela captura de toque nativa), o toque direto no número da quadra não abria o modal.
3. Adicionado `onPress={() => onBlockTap?.(territory, block)}` diretamente na tag `<Marker>` em `app/src/presentation/map/TerritoryMapView.tsx` (e `onTerritoryTap` para os rótulos de território).
4. Replicada a mesma correção preventiva em `admin-app/src/presentation/map/AssignmentsMapView.tsx` para garantir que o toque direto sobre os números no mapa admin também abra o painel da quadra com total precisão.

## Arquivos Afetados
- `app/src/presentation/map/TerritoryMapView.tsx`
- `admin-app/src/presentation/map/AssignmentsMapView.tsx`

## Verificação
- Suíte completa de testes no `app/` (130 testes passando) e `admin-app/` (326 testes passando).
