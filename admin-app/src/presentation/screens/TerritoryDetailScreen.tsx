import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../data/api-client';
import { campaignLabel } from '../../domain/assignment';
import type { Block, Territory } from '../../domain/models';
import { Button, QuerySegmentedControl, QueryState } from '../components';
import { colors, radius, spacing } from '../theme';
import { AssignmentPanel } from './AssignmentPanel';
import type { AssignmentPanelApi, AssignmentPanelSession } from './AssignmentPanel';
import { BlockPanel } from './BlockPanel';
import type { BlockPanelApi } from './BlockPanel';
import { BlocksScreen } from './BlocksScreen';
import type { BlocksScreenApi } from './BlocksScreen';
import { formatDate } from './BlockWorkSection';
import { blockCountLabel } from './DesignationsScreen';
import type { TerritoryDetailSegment } from './DesignationsScreen';

type DetailSegment = TerritoryDetailSegment;

const DETAIL_SEGMENTS = [
  { value: 'assignments', label: 'Designações' },
  { value: 'blocks', label: 'Quadras' },
] as const;

export interface TerritoryDetailScreenApi
  extends AssignmentPanelApi,
    BlocksScreenApi,
    BlockPanelApi {
  getTerritory(territoryId: string): Promise<Territory>;
}

export type TerritoryDetailScreenSession = AssignmentPanelSession;

export interface TerritoryDetailScreenProps {
  readonly territoryId: string;
  readonly session: TerritoryDetailScreenSession;
  readonly api: TerritoryDetailScreenApi;
  /** The stack uses this to return instead of retaining a record deleted elsewhere. */
  readonly onTerritoryRemoved?: () => void;
  /** Which segment opens first: the map and the row's "Quadras" open the blocks. */
  readonly initialSegment?: DetailSegment;
}

function messageFor(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'Não foi possível carregar este território.';
}

/**
 * One stack screen for the questions that belong to one territory. It owns
 * exactly one vertical scroll; the embedded cards render their contents into
 * it instead of creating a gesture contest inside the phone detail.
 */
export function TerritoryDetailScreen({
  territoryId,
  session,
  api,
  onTerritoryRemoved,
  initialSegment = 'assignments',
}: TerritoryDetailScreenProps): React.JSX.Element {
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [segment, setSegment] = useState<DetailSegment>(initialSegment);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTerritory = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setTerritory(await session.run(() => api.getTerritory(territoryId)));
    } catch (caught) {
      if (caught instanceof ApiError && caught.statusCode === 404) {
        onTerritoryRemoved?.();
        return;
      }
      setError(messageFor(caught));
    } finally {
      setIsLoading(false);
    }
  }, [api, onTerritoryRemoved, session, territoryId]);

  useEffect(() => {
    loadTerritory();
  }, [loadTerritory]);

  useEffect(() => {
    if (
      selectedBlock !== null &&
      territory !== null &&
      !territory.blocks.some(block => block.id === selectedBlock.id)
    ) {
      setSelectedBlock(null);
    }
  }, [selectedBlock, territory]);

  // The block detail is state inside this screen, not a stack route, so the
  // hardware back would leave the whole territory. While a block is open it
  // closes the block instead and lands back on the blocks (UX-CONTRACT).
  useEffect(() => {
    if (selectedBlock === null) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setSelectedBlock(null);
      return true;
    });
    return () => subscription.remove();
  }, [selectedBlock]);

  const handleChanged = useCallback(async () => {
    await loadTerritory();
  }, [loadTerritory]);

  if (selectedBlock !== null && territory !== null) {
    const currentBlock = territory.blocks.find(block => block.id === selectedBlock.id);
    if (currentBlock !== undefined) {
      return (
        <View style={styles.blockDetail}>
          <Button
            label="← Quadras"
            variant="quiet"
            accessibilityLabel="Voltar para as quadras"
            onPress={() => setSelectedBlock(null)}
            style={styles.backButton}
          />
          <BlockPanel
            block={currentBlock}
            territory={territory}
            session={session}
            api={api}
            onChanged={handleChanged}
          />
        </View>
      );
    }
  }

  if (isLoading && territory === null) {
    return (
      <View style={styles.centered}>
        <QueryState kind="loading" title="Carregando território" message="Aguarde um momento." />
      </View>
    );
  }

  if (error !== null || territory === null) {
    return (
      <View style={styles.centered}>
        <QueryState
          kind="error"
          title="Não foi possível carregar"
          message={error ?? 'Este território não está mais disponível.'}
          onRetry={() => { loadTerritory(); }}
        />
      </View>
    );
  }

  return (
    <ScrollView testID="territory-detail-scroll" style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.title}>{territory.name}</Text>
        <Text style={styles.summaryText}>
          {territory.campaign
            ? campaignLabel(territory.campaign)
            : territory.assignedPublisher === null
              ? 'Disponível para designação'
              : `Dirigente atual: ${territory.assignedPublisher.name}`}
        </Text>
        <Text style={styles.summaryMeta}>
          {[
            blockCountLabel(territory.blocks.length),
            territory.lastWork
              ? `Último trabalho: ${formatDate(territory.lastWork.workedAt)}`
              : 'Nunca trabalhado',
          ].join(' · ')}
        </Text>
      </View>
      <QuerySegmentedControl
        accessibilityLabel="Detalhes do território"
        segments={DETAIL_SEGMENTS}
        value={segment}
        onChange={value => setSegment(value as DetailSegment)}
      />
      {segment === 'assignments' ? (
        <AssignmentPanel
          territory={territory}
          session={session}
          api={api}
          onChanged={handleChanged}
          scrollable={false}
          showTitle={false}
        />
      ) : (
        <BlocksScreen
          territory={territory}
          session={session}
          api={api}
          scrollable={false}
          showTitle={false}
          onOpenBlock={setSelectedBlock}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  summary: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
  summaryText: { color: colors.textPrimary, fontSize: 15, marginTop: spacing.xs },
  summaryMeta: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  centered: { backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: spacing.md },
  blockDetail: { backgroundColor: colors.background, flex: 1 },
  backButton: { alignSelf: 'flex-start', marginLeft: spacing.sm, marginTop: spacing.xs },
});

export default TerritoryDetailScreen;
