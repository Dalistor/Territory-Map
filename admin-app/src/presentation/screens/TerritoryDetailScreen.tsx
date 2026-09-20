import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../data/api-client';
import type { Block, Territory } from '../../domain/models';
import { QuerySegmentedControl } from '../components';
import { colors, radius, spacing } from '../theme';
import { AssignmentPanel } from './AssignmentPanel';
import type { AssignmentPanelApi, AssignmentPanelSession } from './AssignmentPanel';
import { BlockPanel } from './BlockPanel';
import type { BlockPanelApi } from './BlockPanel';
import { BlocksScreen } from './BlocksScreen';
import type { BlocksScreenApi } from './BlocksScreen';

type DetailSegment = 'assignments' | 'blocks';

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
}: TerritoryDetailScreenProps): React.JSX.Element {
  const [territory, setTerritory] = useState<Territory | null>(null);
  const [segment, setSegment] = useState<DetailSegment>('assignments');
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

  const handleChanged = useCallback(async () => {
    await loadTerritory();
  }, [loadTerritory]);

  if (selectedBlock !== null && territory !== null) {
    const currentBlock = territory.blocks.find(block => block.id === selectedBlock.id);
    if (currentBlock !== undefined) {
      return (
        <View style={styles.blockDetail}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar para as quadras"
            onPress={() => setSelectedBlock(null)}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <Text style={styles.backButtonText}>← Quadras</Text>
          </Pressable>
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
    return <View style={styles.centered}><ActivityIndicator accessibilityLabel="Carregando território" color={colors.primary} /></View>;
  }

  if (error !== null || territory === null) {
    return (
      <View style={styles.centered}>
        <Text accessibilityRole="alert" style={styles.error}>{error ?? 'Este território não está mais disponível.'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Tentar novamente" onPress={() => { loadTerritory(); }} style={styles.retryButton}>
          <Text style={styles.retryText}>Tentar novamente</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView testID="territory-detail-scroll" style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.title}>{territory.name}</Text>
        <Text style={styles.summaryText}>
          {territory.assignedPublisher === null
            ? 'Disponível para designação'
            : `Dirigente atual: ${territory.assignedPublisher.name}`}
        </Text>
      </View>
      <QuerySegmentedControl
        accessibilityLabel="Detalhes do território"
        segments={DETAIL_SEGMENTS}
        value={segment}
        onChange={value => setSegment(value as DetailSegment)}
      />
      {segment === 'assignments' ? (
        <AssignmentPanel territory={territory} session={session} api={api} onChanged={handleChanged} scrollable={false} />
      ) : (
        <BlocksScreen
          territory={territory}
          session={session}
          api={api}
          scrollable={false}
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
  title: { color: colors.textPrimary, fontSize: 21, fontWeight: '700' },
  summaryText: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  centered: { alignItems: 'center', backgroundColor: colors.background, flex: 1, justifyContent: 'center', padding: spacing.lg },
  error: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder, borderRadius: radius.md, borderWidth: 1, color: colors.danger, padding: spacing.md },
  retryButton: { backgroundColor: colors.primary, borderRadius: radius.sm, marginTop: spacing.md, minHeight: 48, paddingHorizontal: spacing.md, justifyContent: 'center' },
  retryText: { color: colors.onPrimary, fontWeight: '600' },
  blockDetail: { backgroundColor: colors.background, flex: 1 },
  backButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  backButtonText: { color: colors.primary, fontWeight: '600' },
  pressed: { opacity: 0.6 },
});

export default TerritoryDetailScreen;
