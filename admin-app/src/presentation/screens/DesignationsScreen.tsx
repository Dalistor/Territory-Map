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
import {
  territoryIsHeld,
  territoryLeaderLabel,
} from '../../domain/territoryMap';
import type { Block, LatLng, Territory } from '../../domain/models';
import { AssignmentsMapView } from '../map/AssignmentsMapView';
import {
  Button,
  QuerySearchField,
  QuerySegmentedControl,
  QueryState,
} from '../components';
import { colors, radius, spacing } from '../theme';
import AssignmentPanel from './AssignmentPanel';
import type { AssignmentPanelApi } from './AssignmentPanel';
import BlockPanel from './BlockPanel';
import type { BlockPanelApi } from './BlockPanel';
import BlocksScreen from './BlocksScreen';
import type { BlocksScreenApi } from './BlocksScreen';
import { formatDate } from './BlockWorkSection';

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
 * The letter in the row's avatar: the dirigente's or the campaign's initial,
 * or a dash when nobody holds the territory.
 */
function leaderInitial(territory: Territory): string {
  const holder = territory.campaign?.name ?? territory.assignedPublisher?.name;
  return holder ? holder.charAt(0).toUpperCase() : '—';
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

/** Which segment the territory detail opens on. */
export type TerritoryDetailSegment = 'assignments' | 'blocks';

type TerritorySituation = 'campaign' | 'ongoing' | 'available';

/**
 * One situation per row, said in words and drawn with the status tokens:
 * "Em andamento" is the warning pair here exactly as in the history screens,
 * a free territory is neutral, and a campaign takes the primary tint.
 */
function territorySituation(territory: Territory): TerritorySituation {
  if (territory.campaign) return 'campaign';
  return territoryIsHeld(territory) ? 'ongoing' : 'available';
}

const SITUATION_LABEL: Record<TerritorySituation, string> = {
  campaign: 'Em campanha',
  ongoing: 'Em andamento',
  available: 'Disponível',
};

/** What TalkBack reads for a row: the territory, who leads it and its situation. */
function territoryRowLabel(territory: Territory): string {
  return (
    `Abrir território ${territory.name}, ` +
    `dirigente ${territoryLeaderLabel(territory)}, ` +
    `situação ${SITUATION_LABEL[territorySituation(territory)]}`
  );
}

export interface DesignationsScreenProps {
  readonly session: DesignationsScreenSession;
  readonly api: DesignationsScreenApi;
  /** Where the map centres while there is no territory to frame -- the congregation's city. */
  readonly fallbackCenter?: LatLng;
  /**
   * The app stack supplies this, with the segment the detail opens on; isolated
   * uses retain the local overlay.
   */
  readonly onOpenTerritory?: (
    territoryId: string,
    initialSegment?: TerritoryDetailSegment,
  ) => void;
}

export function DesignationsScreen({
  session,
  api,
  fallbackCenter,
  onOpenTerritory,
}: DesignationsScreenProps): React.JSX.Element {
  const [territories, setTerritories] = useState<Territory[]>([]);
  // Whether a list has ever arrived. Only the first load replaces the screen
  // with a loading state; a refresh keeps the list, the search and the
  // selection on screen while it runs (UX-CONTRACT, `refresh`).
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const refreshInFlight = useRef(false);
  // A failed read and a failed write are different facts: the first may leave
  // nothing to show and offers to try again, the second never hides the list.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [writingTerritoryId, setWritingTerritoryId] = useState<string | null>(null);
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

  // A territory out in a campaign counts as designated: it is in the field,
  // just held by the campaign instead of one dirigente.
  const assignedCount = territories.filter(territoryIsHeld).length;

  const visibleTerritories = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    if (normalizedSearch === '') return ordered;
    return ordered.filter(territory =>
      [territory.name, territoryLeaderLabel(territory)]
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
    setLoadError(null);
    setActionError(null);
    try {
      setTerritories(await session.run(() => api.listTerritoriesWithBlocks()));
      setHasLoaded(true);
    } catch (thrown) {
      setLoadError(errorMessage(thrown));
    } finally {
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
              setWritingTerritoryId(territory.id);
              setActionError(null);
              try {
                await session.run(() => api.completeAssignment(territory.id));
              } catch (thrown) {
                setActionError(errorMessage(thrown));
                return;
              } finally {
                writeInFlight.current = false;
                setWritingTerritoryId(null);
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

  const openTerritoryDetail = useCallback(
    (territory: Territory, segment: TerritoryDetailSegment) => {
      setSelectedTerritoryId(territory.id);
      if (onOpenTerritory !== undefined) {
        onOpenTerritory(territory.id, segment);
        return;
      }
      setDetail({ territoryId: territory.id, view: segment });
    },
    [onOpenTerritory],
  );

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
   * to show the message would throw away where he was. The list it refers to
   * stays on screen either way: a failed refresh offers to try again, a failed
   * write just says what went wrong.
   */
  const bannerMessage = hasLoaded ? loadError ?? actionError : actionError;
  const errorBanner =
    bannerMessage === null ? null : (
      <View style={styles.banner}>
        <Text accessible accessibilityRole="alert" style={styles.bannerText}>
          {bannerMessage}
        </Text>
        {hasLoaded && loadError !== null && (
          <Button label="Tentar novamente" variant="quiet" onPress={() => load()} />
        )}
      </View>
    );

  const isFirstLoad = !hasLoaded && isRefreshing;
  const searchHasNoResults = ordered.length > 0 && visibleTerritories.length === 0;
  const clearSearch = useCallback(() => setSearch(''), []);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.summary}>
          {hasLoaded
            ? `${assignedCount} de ${territories.length} territórios designados`
            : ''}
        </Text>
        <Button
          label="Recarregar"
          busyLabel="Atualizando…"
          busy={isRefreshing}
          onPress={() => load()}
        />
      </View>

      {!isDetailOpen && errorBanner}

      {isFirstLoad ? (
        <View style={styles.stateArea}>
          <QueryState
            kind="loading"
            title="Carregando territórios"
            message="Aguarde um momento."
          />
        </View>
      ) : !hasLoaded ? (
        <View style={styles.stateArea}>
          <QueryState
            kind="error"
            title="Não foi possível carregar"
            message={loadError ?? LOAD_ERROR_MESSAGE}
            onRetry={() => load()}
          />
        </View>
      ) : (
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
              {/* On the map a territory opens its blocks: there the admin is
                  already looking at them, and "what has been worked" is the
                  question. Designating stays one tap away on the list row. */}
              <AssignmentsMapView
                territories={visibleTerritories}
                fallbackCenter={fallbackCenter}
                onSelectTerritory={territory =>
                  openTerritoryDetail(territory, 'blocks')
                }
                onSelectBlock={(block, territory) => {
                  setSelectedTerritoryId(territory.id);
                  setDetail({
                    territoryId: territory.id,
                    view: 'block',
                    blockId: block.id,
                  });
                }}
              />
              {searchHasNoResults && (
                <View style={styles.mapNotice}>
                  <QueryState
                    compact
                    kind="no-results"
                    title="Nenhum território encontrado"
                    message={NO_SEARCH_RESULTS_MESSAGE}
                    onClear={clearSearch}
                  />
                </View>
              )}
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
            >
              {ordered.length === 0 && (
                <QueryState
                  kind="empty"
                  title="Nenhum território"
                  message={NO_TERRITORIES_MESSAGE}
                />
              )}
              {searchHasNoResults && (
                <QueryState
                  kind="no-results"
                  title="Nenhum território encontrado"
                  message={NO_SEARCH_RESULTS_MESSAGE}
                  onClear={clearSearch}
                />
              )}
              {visibleTerritories.map(territory => {
                const situation = territorySituation(territory);
                const isWritingRow = writingTerritoryId === territory.id;
                return (
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
                      accessibilityLabel={territoryRowLabel(territory)}
                      accessibilityState={{ selected: selectedTerritoryId === territory.id }}
                      onPress={() => openTerritoryDetail(territory, 'assignments')}
                      style={({ pressed }) => [
                        styles.cardMain,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={styles.cardHeader}>
                        <Text style={styles.territoryName}>{territory.name}</Text>
                        <View style={[styles.statusBadge, badgeStyles[situation]]}>
                          <View style={[styles.statusDot, dotStyles[situation]]} />
                          <Text style={[styles.statusBadgeText, badgeTextStyles[situation]]}>
                            {SITUATION_LABEL[situation]}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.leaderRow}>
                        <View
                          style={[
                            styles.leaderAvatar,
                            !territoryIsHeld(territory) &&
                              styles.leaderAvatarEmpty,
                          ]}
                        >
                          <Text
                            style={[
                              styles.leaderAvatarText,
                              !territoryIsHeld(territory) &&
                                styles.leaderAvatarTextEmpty,
                            ]}
                          >
                            {leaderInitial(territory)}
                          </Text>
                        </View>
                        <Text
                          style={[
                            styles.leader,
                            !territoryIsHeld(territory) && styles.leaderAbsent,
                          ]}
                        >
                          {territoryLeaderLabel(territory)}
                        </Text>
                      </View>

                      <View style={styles.metaRow}>
                        <Text style={styles.meta}>
                          {blockCountLabel(territory.blocks.length)}
                        </Text>
                        <Text style={styles.meta}>
                          {territory.lastWork
                            ? `Último trabalho: ${
                                territory.lastWork.publisher.name
                              } — ${formatDate(territory.lastWork.workedAt)}`
                            : 'Nunca trabalhado'}
                        </Text>
                      </View>
                    </Pressable>

                    <View style={styles.cardActionsContainer}>
                      <Button
                        label="Quadras"
                        variant="quiet"
                        accessibilityLabel={`Ver quadras de ${territory.name}`}
                        onPress={() => openTerritoryDetail(territory, 'blocks')}
                        style={styles.cardAction}
                      />

                      {territory.assignedPublisher !== null && (
                        <Button
                          label="Marcar como concluído"
                          busyLabel="Atualizando…"
                          variant="quiet"
                          accessibilityLabel={`Marcar ${territory.name} como concluído`}
                          busy={isWritingRow}
                          onPress={() => requestComplete(territory)}
                          style={[styles.cardAction, styles.cardActionDivided]}
                        />
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </>
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
            <Button
              label="← Voltar"
              variant="quiet"
              accessibilityLabel="Voltar para a lista"
              onPress={closeDetail}
            />
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
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  banner: {
    alignItems: 'center',
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    margin: spacing.md,
    marginBottom: 0,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  bannerText: {
    color: colors.dangerText,
    flex: 1,
    fontSize: 14,
    paddingVertical: spacing.sm,
  },
  summary: {
    color: colors.textPrimary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  stateArea: {
    padding: spacing.md,
  },
  queryControls: {
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  /** The selected map gets the consultation area without displacing its controls. */
  map: {
    flex: 1,
    marginTop: spacing.sm,
    // Clips the MapLibre `Marker`s to the map's own box. They are native
    // React Native views positioned over the map, and Android does not clip
    // children to the parent's bounds on its own -- without this, a block
    // number sitting above the top edge renders up into the header.
    overflow: 'hidden',
  },
  mapNotice: {
    left: spacing.md,
    position: 'absolute',
    right: spacing.md,
    top: spacing.md,
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
  },
  cardSelected: {
    borderColor: colors.primary,
  },
  cardMain: {
    padding: spacing.md,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  statusBadge: {
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  statusDot: {
    borderRadius: radius.full,
    height: 6,
    width: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
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
    borderRadius: radius.full,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  leaderAvatarEmpty: {
    backgroundColor: colors.surfaceSubtle,
    borderColor: colors.border,
    borderWidth: 1,
  },
  leaderAvatarText: {
    color: colors.primaryPressed,
    fontSize: 12,
    fontWeight: '700',
  },
  leaderAvatarTextEmpty: {
    color: colors.textSecondary,
  },
  metaRow: {
    columnGap: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    rowGap: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  cardActionsContainer: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
  },
  cardAction: {
    borderRadius: 0,
    flex: 1,
  },
  cardActionDivided: {
    borderLeftColor: colors.border,
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
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  leader: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  leaderAbsent: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
});

const badgeStyles = StyleSheet.create({
  campaign: { backgroundColor: colors.primaryLight, borderColor: colors.primaryLight },
  ongoing: { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
  available: { backgroundColor: colors.surface, borderColor: colors.border },
});

const dotStyles = StyleSheet.create({
  campaign: { backgroundColor: colors.primary },
  ongoing: { backgroundColor: colors.warning },
  available: { backgroundColor: colors.textMuted },
});

const badgeTextStyles = StyleSheet.create({
  campaign: { color: colors.primaryPressed },
  ongoing: { color: colors.warningText },
  available: { color: colors.textSecondary },
});

export default DesignationsScreen;
