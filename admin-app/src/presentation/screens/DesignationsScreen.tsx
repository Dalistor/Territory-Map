// The admin app's home screen (spec 0012, Task 10): who is holding each
// territory, on the map and in a list.
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { compareTerritoriesByNumber } from '../../domain/models';
import type { Block, LatLng, Territory } from '../../domain/models';
import { AssignmentsMapView } from '../map/AssignmentsMapView';
import {
  QuerySearchField,
  QuerySegmentedControl,
  QueryState,
} from '../components';
import { colors, radius, shadows, spacing } from '../theme';
import AssignmentPanel from './AssignmentPanel';
import type { AssignmentPanelApi } from './AssignmentPanel';
import BlockPanel from './BlockPanel';
import type { BlockPanelApi } from './BlockPanel';
import BlocksScreen from './BlocksScreen';
import type { BlocksScreenApi } from './BlocksScreen';
import { formatDate } from './BlockWorkSection';

/** What a row says when nobody is responsible for the territory. */
const NO_LEADER_LABEL = 'Sem dirigente';

/**
 * How many blocks the territory has, as the row says it. The count is what
 * tells the admin whether a territory has been drawn out yet at all -- a
 * territory with no blocks is demarcated but not subdivided, and that is work
 * still waiting on the desktop.
 */
export function blockCountLabel(count: number): string {
  if (count === 0) {
    return 'Sem quadras';
  }
  return count === 1 ? '1 quadra' : `${count} quadras`;
}

/**
 * Word for word the message `AssignmentPanel` shows for the same action --
 * completing from the row and completing from the S-13 card are the same
 * event, so they must warn about the same consequence.
 */
function completeConfirmMessage(
  territoryName: string,
  leaderName: string,
): string {
  return (
    `Marcar a designação de ${leaderName} em "${territoryName}" como concluída?\n\n` +
    'O território fica livre para outro publicador, e ' +
    `${leaderName} perde na hora o acesso para marcar quadras nele.`
  );
}

/**
 * A congregation with no territories is not a bug and not an empty list
 * either: drawing a demarcation is one of the things this app deliberately
 * does not do, so the screen says where it is done rather than leaving a blank
 * page the admin has to interpret.
 */
export const NO_TERRITORIES_MESSAGE =
  'Nenhum território cadastrado. Os territórios são criados e desenhados no admin do computador.';

const LOAD_ERROR_MESSAGE = 'Não foi possível carregar os territórios.';

/**
 * The message whoever failed already wrote -- `ApiError` and `NetworkError`
 * both carry text meant for this admin. Anything else falls back rather than
 * printing a stringified object at him.
 */
function errorMessage(thrown: unknown): string {
  return thrown instanceof Error && thrown.message !== ''
    ? thrown.message
    : LOAD_ERROR_MESSAGE;
}

/**
 * The slice of the API client this screen needs -- its own one read, plus
 * everything the panel it opens needs, since this screen is what hands the
 * client down. A test passes a fake; the real `ApiClient` satisfies it.
 */
export interface DesignationsScreenApi
  extends AssignmentPanelApi,
    BlocksScreenApi,
    BlockPanelApi {
  listTerritoriesWithBlocks(): Promise<Territory[]>;
}

/** The slice of the session this screen needs -- it never sees a token. */
export interface DesignationsScreenSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

/**
 * What the admin opened on one territory: its S-13 card, its blocks, or the
 * combined panel of a single block tapped on the map. Different questions about
 * the same territory, so they are one state and never stack on top of each
 * other.
 *
 * The block is held by id for the same reason the territory is: the list is
 * reloaded after every write, and holding the object would pin the panel to the
 * copy fetched before the change -- exactly the staleness this screen reloads
 * to avoid.
 */
interface TerritoryDetail {
  readonly territoryId: string;
  readonly view: 'assignments' | 'blocks' | 'block';
  readonly blockId?: string;
}

type TerritoryView = 'list' | 'map';

const TERRITORY_VIEW_SEGMENTS = [
  { value: 'list', label: 'Lista' },
  { value: 'map', label: 'Mapa' },
] as const;

const NO_SEARCH_RESULTS_MESSAGE = 'Nenhum território corresponde à busca.';

export interface DesignationsScreenProps {
  readonly session: DesignationsScreenSession;
  readonly api: DesignationsScreenApi;
  /** Where the map centres while there is no territory to frame -- the congregation's city. */
  readonly fallbackCenter?: LatLng;
  /** The app stack supplies this; isolated uses retain the local overlay. */
  readonly onOpenTerritory?: (territoryId: string) => void;
}

export function DesignationsScreen({
  session,
  api,
  fallbackCenter,
  onOpenTerritory,
}: DesignationsScreenProps): React.JSX.Element {
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshInFlight = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const writeInFlight = useRef(false);
  const [view, setView] = useState<TerritoryView>('list');
  const [search, setSearch] = useState('');
  const [selectedTerritoryId, setSelectedTerritoryId] = useState<string | null>(null);
  // Which territory has a detail open and which of the two it is, by id rather
  // than by object: the list is reloaded after every write, and holding the
  // object would leave the detail pinned to the copy fetched before the change.
  const [detail, setDetail] = useState<TerritoryDetail | null>(null);

  // Ordered by the territory *number* (`compareTerritoriesByNumber`), not by
  // the area name -- the congregation reads its list that way, and a plain
  // name sort put "Casarotto -N28" ahead of "Centro - N5" just because "C"
  // sorts before "C" the wrong way. Same rule the desktop admin's territory
  // list already applies (`admin/src/shared/models.ts`).
  const ordered = useMemo(
    () =>
      [...territories].sort((a, b) =>
        compareTerritoriesByNumber(a.name, b.name),
      ),
    [territories],
  );

  const assignedCount = territories.filter(
    territory => territory.assignedPublisher !== null,
  ).length;

  const visibleTerritories = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    if (normalizedSearch === '') return ordered;
    return ordered.filter(territory =>
      [territory.name, territory.assignedPublisher?.name ?? NO_LEADER_LABEL]
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(normalizedSearch),
    );
  }, [ordered, search]);

  // Looked up in the current list, so the detail always holds the freshest copy
  // of the territory; a territory that vanished from a reload closes its own
  // detail instead of showing a stale one.
  const detailTerritory =
    detail === null
      ? null
      : territories.find(territory => territory.id === detail.territoryId) ??
        null;

  // Looked up the same way, and for the same reason: a block deleted on the
  // desktop between two loads closes its panel instead of describing something
  // that is no longer there.
  const detailBlock: Block | null =
    detail?.view === 'block' && detailTerritory !== null
      ? detailTerritory.blocks.find(block => block.id === detail.blockId) ??
        null
      : null;

  /**
   * The one read this screen does. Called on mount and by "Recarregar", and
   * again after every panel action, because the leader shown in each row is a
   * projection of the open assignment the panel just changed.
   */
  const load = useCallback(async () => {
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    setIsLoading(true);
    setLoadError(null);
    try {
      setTerritories(await session.run(() => api.listTerritoriesWithBlocks()));
    } catch (thrown) {
      setLoadError(errorMessage(thrown));
    } finally {
      setIsLoading(false);
      refreshInFlight.current = false;
      setIsRefreshing(false);
    }
  }, [api, session]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * "Marcar como concluído" straight from the row. The S-13 card offers the
   * same action, but reaching it costs two taps and the admin walking a list
   * of territories is doing exactly one thing. Only offered where there is an
   * open assignment to close -- `assignedPublisher` is the projection of it.
   */
  const requestComplete = useCallback(
    (territory: Territory) => {
      const leader = territory.assignedPublisher;
      if (leader === null) {
        return;
      }
      Alert.alert(
        'Marcar como concluído',
        completeConfirmMessage(territory.name, leader.name),
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Concluir',
            onPress: async () => {
              if (writeInFlight.current) {
                return;
              }
              writeInFlight.current = true;
              setIsWriting(true);
              setLoadError(null);
              try {
                await session.run(() => api.completeAssignment(territory.id));
              } catch (thrown) {
                setLoadError(errorMessage(thrown));
                return;
              } finally {
                writeInFlight.current = false;
                setIsWriting(false);
              }
              await load();
            },
          },
        ],
      );
    },
    [api, load, session],
  );

  /** Whether the overlay is actually on screen, covering the active consultation mode. */
  const isDetailOpen =
    detailTerritory !== null &&
    (detail?.view !== 'block' || detailBlock !== null);

  const closeDetail = useCallback(() => {
    setDetail(null);
  }, []);

  const openTerritoryDetail = useCallback((territory: Territory) => {
    setSelectedTerritoryId(territory.id);
    if (onOpenTerritory !== undefined) {
      onOpenTerritory(territory.id);
      return;
    }
    setDetail({ territoryId: territory.id, view: 'assignments' });
  }, [onOpenTerritory]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!isDetailOpen) {
          return false;
        }

        closeDetail();
        return true;
      },
    );

    return () => subscription.remove();
  }, [closeDetail, isDetailOpen]);

  /**
   * One alert element, rendered wherever the admin can see it. The overlay is
   * opaque and absolutely positioned, so a failed reload announced underneath
   * it would be invisible to the person who caused it -- and closing the panel
   * to show the message would throw away where he was.
   */
  const errorBanner =
    loadError === null ? null : (
      <Text accessible accessibilityRole="alert" style={styles.error}>
        {loadError}
      </Text>
    );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        {!isLoading && loadError === null && (
          <Text style={styles.summary}>
            {assignedCount} de {territories.length} territórios designados
          </Text>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Recarregar"
          accessibilityState={{
            disabled: isLoading || isRefreshing,
            busy: isRefreshing,
          }}
          disabled={isLoading || isRefreshing}
          onPress={() => load()}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.headerButtonLabel}>
            {isLoading || isRefreshing ? 'Atualizando…' : 'Recarregar'}
          </Text>
        </Pressable>
      </View>

      {!isDetailOpen && errorBanner}

      {isLoading ? (
        <ActivityIndicator
          accessibilityRole="progressbar"
          accessibilityLabel="Carregando"
          color={colors.primary}
        />
      ) : (
        loadError === null && (
          <>
            <View style={styles.queryControls}>
              <QuerySegmentedControl
                accessibilityLabel="Visualização de territórios"
                segments={TERRITORY_VIEW_SEGMENTS}
                value={view}
                onChange={nextView => setView(nextView as TerritoryView)}
              />
              <QuerySearchField
                accessibilityLabel="Buscar territórios"
                placeholder="Buscar território ou dirigente"
                value={search}
                onChangeText={setSearch}
              />
            </View>
            {view === 'map' ? (
              <View style={styles.map}>
                <AssignmentsMapView
                  territories={visibleTerritories}
                  fallbackCenter={fallbackCenter}
                  onSelectTerritory={openTerritoryDetail}
                  onSelectBlock={(block, territory) => {
                    setSelectedTerritoryId(territory.id);
                    setDetail({
                      territoryId: territory.id,
                      view: 'block',
                      blockId: block.id,
                    });
                  }}
                />
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {ordered.length === 0 && (
                  <Text style={styles.emptyMessage}>
                    {NO_TERRITORIES_MESSAGE}
                  </Text>
                )}
                {ordered.length > 0 && visibleTerritories.length === 0 && (
                  <QueryState
                    kind="no-results"
                    title="Nenhum território encontrado"
                    message={NO_SEARCH_RESULTS_MESSAGE}
                  />
                )}
              {visibleTerritories.map(territory => (
                <View
                  key={territory.id}
                  testID={`territory-row-${territory.id}`}
                  style={[
                    styles.card,
                    selectedTerritoryId === territory.id && styles.cardSelected,
                  ]}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Ver designações de ${territory.name}`}
                    accessibilityState={{ selected: selectedTerritoryId === territory.id }}
                    onPress={() =>
                      openTerritoryDetail(territory)
                    }
                    style={({ pressed }) => [
                      styles.cardMain,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.cardHeader}>
                      <Text style={styles.territoryName}>{territory.name}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          territory.assignedPublisher !== null
                            ? styles.statusBadgeWorking
                            : styles.statusBadgeIdle,
                        ]}
                      >
                        <View
                          style={[
                            styles.statusDot,
                            territory.assignedPublisher !== null
                              ? styles.statusDotWorking
                              : styles.statusDotIdle,
                          ]}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            territory.assignedPublisher !== null
                              ? styles.statusBadgeTextWorking
                              : styles.statusBadgeTextIdle,
                          ]}
                        >
                          {territory.assignedPublisher !== null
                            ? 'Em andamento'
                            : 'Disponível'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.leaderRow}>
                      <View
                        style={[
                          styles.leaderAvatar,
                          territory.assignedPublisher === null &&
                            styles.leaderAvatarEmpty,
                        ]}
                      >
                        <Text style={styles.leaderAvatarText}>
                          {territory.assignedPublisher
                            ? territory.assignedPublisher.name.charAt(0).toUpperCase()
                            : '—'}
                        </Text>
                      </View>
                      <View style={styles.leaderInfo}>
                        <Text
                          style={[
                            styles.leader,
                            territory.assignedPublisher === null &&
                              styles.leaderAbsent,
                          ]}
                        >
                          {territory.assignedPublisher?.name ?? NO_LEADER_LABEL}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaBadge}>
                        <Text style={styles.metaIcon}>🧱</Text>
                        <Text style={styles.blockCount}>
                          {blockCountLabel(territory.blocks.length)}
                        </Text>
                      </View>
                      <View style={styles.metaBadge}>
                        <Text style={styles.metaIcon}>🗓️</Text>
                        <Text style={styles.lastWork}>
                          {territory.lastWork
                            ? `Último trabalho: ${
                                territory.lastWork.publisher.name
                              } — ${formatDate(territory.lastWork.workedAt)}`
                            : 'Nunca trabalhado'}
                        </Text>
                      </View>
                    </View>
                  </Pressable>

                  <View style={styles.cardActionsContainer}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Ver quadras de ${territory.name}`}
                      onPress={() =>
                        setDetail({ territoryId: territory.id, view: 'blocks' })
                      }
                      style={({ pressed }) => [
                        styles.cardActionBtn,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.cardActionLabel}>Quadras</Text>
                    </Pressable>

                    {territory.assignedPublisher !== null && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Marcar ${territory.name} como concluído`}
                        accessibilityState={{
                          disabled: isWriting,
                          busy: isWriting,
                        }}
                        disabled={isWriting}
                        onPress={() => requestComplete(territory)}
                        style={({ pressed }) => [
                          styles.cardActionBtn,
                          styles.cardActionBtnPrimary,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.cardActionLabel,
                            styles.cardActionLabelPrimary,
                          ]}
                        >
                          {isWriting ? 'Atualizando…' : 'Marcar como concluído'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              ))}
              </ScrollView>
            )}
          </>
        )
      )}

      {/* The detail covers the list instead of replacing it: the list stays
          mounted, so a designation made in here is already reflected behind it
          when the admin closes the panel -- and the map does not refit its
          camera on the way back. It is a `SafeAreaView` because it is absolutely
          positioned over the whole screen: without it the "← Voltar" button
          sits under the status bar and the panel's bottom under the gesture
          bar. */}
      {isDetailOpen && detailTerritory !== null && (
        <SafeAreaView style={styles.overlay}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Voltar para a lista"
              onPress={closeDetail}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.headerButtonLabel}>← Voltar</Text>
            </Pressable>
          </View>
          {errorBanner}
          {detail?.view === 'assignments' && (
            <AssignmentPanel
              territory={detailTerritory}
              session={session}
              api={api}
              onChanged={load}
            />
          )}
          {detail?.view === 'blocks' && (
            <BlocksScreen
              territory={detailTerritory}
              session={session}
              api={api}
              fallbackCenter={fallbackCenter}
            />
          )}
          {/* The block tapped on the map: its own actions and, below them, the
              card of the territory that owns it. Both change something drawn on
              the map behind, so both reload the list through `onChanged`. */}
          {detail?.view === 'block' && detailBlock !== null && (
            <BlockPanel
              block={detailBlock}
              territory={detailTerritory}
              session={session}
              api={api}
              onChanged={load}
            />
          )}
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  headerButton: {
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  headerButtonLabel: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.danger,
    margin: spacing.md,
    padding: spacing.sm,
  },
  summary: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  /** The selected map gets the consultation area without displacing its controls. */
  map: {
    flex: 1,
    // Clips the MapLibre `Marker`s to the map's own box. They are native
    // React Native views positioned over the map, and Android does not clip
    // children to the parent's bounds on its own -- without this, a block
    // number sitting above the top edge renders up into the header.
    overflow: 'hidden',
  },
  list: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    ...shadows.sm,
  },
  cardSelected: {
    borderColor: colors.primary,
    borderWidth: 2,
  },
  cardMain: {
    padding: spacing.md,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeWorking: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusBadgeIdle: {
    backgroundColor: '#f0f9ff',
    borderColor: '#bae6fd',
  },
  statusDot: {
    borderRadius: radius.full,
    height: 6,
    marginRight: 5,
    width: 6,
  },
  statusDotWorking: {
    backgroundColor: '#10b981',
  },
  statusDotIdle: {
    backgroundColor: '#0284c7',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusBadgeTextWorking: {
    color: '#047857',
  },
  statusBadgeTextIdle: {
    color: '#0369a1',
  },
  leaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.xs,
  },
  leaderAvatar: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  leaderAvatarEmpty: {
    backgroundColor: colors.surfaceSubtle,
  },
  leaderAvatarText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  leaderInfo: {
    flex: 1,
  },
  leaderLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  metaBadge: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaIcon: {
    fontSize: 12,
  },
  cardActionsContainer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  cardActionBtn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: 10,
  },
  cardActionBtnPrimary: {
    backgroundColor: colors.surfaceSubtle,
    borderLeftColor: colors.border,
    borderLeftWidth: 1,
  },
  cardActionLabel: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  cardActionLabelPrimary: {
    color: colors.primary,
    fontWeight: '700',
  },
  overlay: {
    backgroundColor: colors.background,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  territoryName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  leader: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  leaderAbsent: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  blockCount: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  situation: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  queryControls: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  lastWork: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyMessage: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
  },
});

export default DesignationsScreen;
