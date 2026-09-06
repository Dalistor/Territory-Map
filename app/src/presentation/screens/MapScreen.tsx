// The publisher's map (spec 0005, Task 25): composes `TerritoryMapView`
// (`../map/TerritoryMapView.tsx`) with a filter control and the "mark this
// block as worked" flow. `session` and `apiClient` follow the same injection
// pattern `DashboardScreen.tsx` already uses -- this screen fetches its own
// territories rather than depending on whatever `DashboardScreen` happened to
// load, because the filter needs the *whole* congregation list ("Todos" and
// the per-territory picker), not just the ones assigned to this publisher.
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { v4 as uuidv4 } from 'uuid';
import { ApiErrorException, NetworkException, type ApiClient } from '../../data/api-client';
import { isTerritoryAssignedToMe } from '../../domain/assignment';
import { describeLastWorked } from '../../domain/lastWorked';
import type { Block, Session, Territory } from '../../domain/models';
import { TerritoryMapView } from '../map/TerritoryMapView';
import {
  defaultFilter,
  searchTerritories,
  visibleTerritories,
  type MapFilter,
} from '../map/territoryFilter';
import { colors, radius, shadows, spacing } from '../theme';

export interface MapScreenProps {
  readonly session: Session;
  readonly apiClient: Pick<ApiClient, 'listTerritories' | 'markBlockWorked'>;
  /** Preselects the `'specific'` filter to this territory -- how `DashboardScreen`'s "Ver no mapa" opens this screen (wired in Task 26). */
  readonly initialTerritoryId?: string;
  /** Injected so a fixed "now" can drive the block colours; defaults to the real clock. */
  readonly now?: Date;
}

interface BlockTarget {
  readonly territory: Territory;
  readonly block: Block;
}

export function MapScreen({
  session,
  apiClient,
  initialTerritoryId,
  now,
}: MapScreenProps): React.JSX.Element {
  const effectiveNow = now ?? new Date();
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [filter, setFilter] = useState<MapFilter>(
    initialTerritoryId !== undefined
      ? { mode: 'specific', territoryId: initialTerritoryId }
      : { mode: 'all' },
  );
  // Once the real territory list arrives, replace the placeholder above with
  // `defaultFilter` -- but only once, and only when the caller did not ask
  // for a specific territory, so the publisher's own later taps on the
  // filter bar are never overwritten by a second fetch.
  const [filterInitialized, setFilterInitialized] = useState(false);
  /**
   * The blocks marked during this session, shown as worked without waiting
   * for the territory list to be fetched again.
   *
   * Written only *after* the server has accepted the visit -- never
   * optimistically. A green block here means the record exists on the
   * server, which is the whole point of requiring the round trip.
   */
  const [justWorked, setJustWorked] = useState<Record<string, Date>>({});
  const [confirmTarget, setConfirmTarget] = useState<BlockTarget | null>(null);
  /** True while the server round trip is in flight -- the confirm button must not fire twice. */
  const [saving, setSaving] = useState(false);
  const [readOnlyTarget, setReadOnlyTarget] = useState<BlockTarget | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  /** What the publisher typed in the search box -- narrows the chip list and suggestions. */
  const [search, setSearch] = useState('');

  useEffect(() => {
    apiClient
      .listTerritories(session.token)
      .then(setTerritories)
      // `withOfflineFallback` (App.tsx) already absorbed "no signal with a
      // cache to show"; reaching here means there is truly nothing to draw.
      .catch(() => setBanner('Não foi possível carregar os territórios. Verifique a conexão.'));
  }, [apiClient, session.token]);

  useEffect(() => {
    if (filterInitialized || initialTerritoryId !== undefined || territories.length === 0) return;
    setFilter(defaultFilter(territories, session.user.id));
    setFilterInitialized(true);
  }, [territories, filterInitialized, initialTerritoryId, session.user.id]);

  const territoriesWithOverrides = useMemo(
    (): Territory[] =>
      territories.map((territory) => ({
        ...territory,
        blocks: territory.blocks.map((block) =>
          justWorked[block.id] !== undefined
            ? { ...block, lastWorkedAt: justWorked[block.id] }
            : block,
        ),
      })),
    [territories, justWorked],
  );

  const visible = useMemo(
    () => visibleTerritories(territoriesWithOverrides, filter, session.user.id),
    [territoriesWithOverrides, filter, session.user.id],
  );

  const selectedTerritory = useMemo(
    () =>
      filter.mode === 'specific'
        ? territories.find((t) => t.id === filter.territoryId) ?? null
        : null,
    [territories, filter],
  );

  function handleBlockTap(territory: Territory, block: Block): void {
    if (isTerritoryAssignedToMe(territory, session.user.id)) {
      setConfirmTarget({ territory, block });
    } else {
      // Outside a territory designated to this publisher: read-only info,
      // never the option to mark it (AGENTS.md, "Marcar quadra como
      // trabalhada" / spec 0005's designation rule).
      setReadOnlyTarget({ territory, block });
    }
  }

  /**
   * Records the visit on the server, and only then shows the block as done.
   *
   * There is deliberately no local fallback: a visit that did not reach the
   * server is not recorded, and the publisher is told so, rather than
   * looking at a green block that exists only on this phone.
   *
   * The `logId` is generated here and sent with the request so the server
   * can recognise a repeat of the *same* confirmation (its idempotency key).
   */
  async function handleConfirmWorked(): Promise<void> {
    if (confirmTarget === null) return;
    const { block } = confirmTarget;
    const workedAt = effectiveNow;
    setSaving(true);
    try {
      await apiClient.markBlockWorked(session.token, block.id, uuidv4(), workedAt);
    } catch (error) {
      if (error instanceof NetworkException) {
        setBanner(
          'Sem conexão com o servidor: a marcação não foi registrada. Tente de novo quando houver internet.',
        );
      } else if (error instanceof ApiErrorException) {
        // The server's own words -- "território não designado", "quadra não
        // encontrada" -- say more than anything this screen could guess.
        setBanner(`A marcação não foi registrada: ${error.detail}`);
      } else {
        setBanner('A marcação não foi registrada. Tente novamente.');
      }
      return;
    } finally {
      setSaving(false);
      setConfirmTarget(null);
    }
    setBanner(null);
    setJustWorked((previous) => ({ ...previous, [block.id]: workedAt }));
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      {banner !== null && (
        <View style={styles.banner}>
          <Text style={styles.bannerIcon}>⚠️</Text>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      )}
      <FilterControl
        filter={filter}
        territories={territories}
        search={search}
        onSearchChange={setSearch}
        onChange={(newFilter) => {
          setFilter(newFilter);
        }}
      />
      <View style={styles.mapWrapper}>
        <TerritoryMapView
          territories={visible}
          myUserId={session.user.id}
          // The overview shows names over the demarcations; the blocks and
          // their numbers appear once a single territory is picked.
          showBlocks={filter.mode === 'specific'}
          now={effectiveNow}
          onBlockTap={handleBlockTap}
          onTerritoryTap={(territory) =>
            setFilter({ mode: 'specific', territoryId: territory.id })
          }
        />
        {/* Floating selected territory bottom card */}
        {selectedTerritory !== null && (
          <View style={styles.bottomCard}>
            <View style={styles.bottomCardHeader}>
              <View style={styles.bottomCardInfo}>
                <Text style={styles.bottomCardTitle}>{selectedTerritory.name}</Text>
                <View style={styles.bottomCardBadges}>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {selectedTerritory.blocks.length}{' '}
                      {selectedTerritory.blocks.length === 1 ? 'quadra' : 'quadras'}
                    </Text>
                  </View>
                  {isTerritoryAssignedToMe(selectedTerritory, session.user.id) ? (
                    <View style={[styles.badge, styles.badgeMine]}>
                      <Text style={styles.badgeMineText}>Designado a você</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => setFilter({ mode: 'all' })}
                style={({ pressed }) => [
                  styles.clearSelectionButton,
                  pressed && styles.clearSelectionButtonPressed,
                ]}
              >
                <Text style={styles.clearSelectionText}>Ver todos</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
      {confirmTarget !== null && (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Marcar quadra {confirmTarget.block.number} como trabalhada?
                </Text>
                <Text style={styles.modalSubtitle}>{confirmTarget.territory.name}</Text>
              </View>
              <View style={styles.modalInfoBox}>
                <Text style={styles.modalInfoLabel}>Status recente:</Text>
                <Text style={styles.modalDetail}>
                  {describeLastWorked(confirmTarget.block, effectiveNow)}
                </Text>
              </View>
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmTarget(null)}
                  style={({ pressed }) => [styles.textButton, pressed && styles.textButtonPressed]}
                >
                  <Text style={styles.textButtonLabel}>Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={saving}
                  onPress={handleConfirmWorked}
                  style={({ pressed }) => [
                    styles.filledButton,
                    pressed && styles.filledButtonPressed,
                    saving && styles.filledButtonDisabled,
                  ]}
                >
                  <Text style={styles.filledButtonLabel}>
                    {saving ? 'Registrando…' : 'Confirmar'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
      {readOnlyTarget !== null && (
        <Modal transparent animationType="fade" onRequestClose={() => setReadOnlyTarget(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  Quadra {readOnlyTarget.block.number} — {readOnlyTarget.territory.name}
                </Text>
              </View>
              <View style={styles.modalInfoBox}>
                <Text style={styles.modalInfoLabel}>Status:</Text>
                <Text style={styles.modalDetail}>
                  {describeLastWorked(readOnlyTarget.block, effectiveNow)}
                </Text>
              </View>
              <Text style={styles.readOnlyHint}>
                Este território não está designado a você — fale com quem cuida dos territórios na
                congregação para poder marcar quadras aqui.
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReadOnlyTarget(null)}
                  style={({ pressed }) => [
                    styles.filledButton,
                    pressed && styles.filledButtonPressed,
                  ]}
                >
                  <Text style={styles.filledButtonLabel}>Fechar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

interface FilterControlProps {
  readonly filter: MapFilter;
  readonly territories: Territory[];
  readonly search: string;
  readonly onSearchChange: (search: string) => void;
  readonly onChange: (filter: MapFilter) => void;
}

/** One chip of the filter bar; the active one flips to the filled/primary look. */
function FilterChip({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        active && styles.filterChipActive,
        pressed && !active && styles.filterChipPressed,
      ]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/**
 * The search box plus the chip row: "Meu(s) território(s)" / "Todos" / one
 * chip per individual territory.
 *
 * The search narrows the chips and displays instant suggestions.
 * An explicit Clear button (✕) ensures reliable clearing on Android.
 */
function FilterControl({
  filter,
  territories,
  search,
  onSearchChange,
  onChange,
}: FilterControlProps): React.JSX.Element {
  // Ranked, not filtered flat: the closest name comes first and the looser
  // ones stay reachable below it.
  const matches = searchTerritories(territories, search);
  const searching = search.trim().length > 0;

  return (
    <View style={styles.filterContainer}>
      <View style={styles.searchBarRow}>
        <View style={styles.searchInputContainer}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={onSearchChange}
            placeholder="Buscar território pelo nome"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Buscar território pelo nome"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar busca"
              onPress={() => onSearchChange('')}
              style={styles.clearSearchButton}
              hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
            >
              <Text style={styles.clearSearchIcon}>✕</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView horizontal style={styles.filterBar} showsHorizontalScrollIndicator={false}>
        {/* The two mode chips stay put while searching. */}
        <FilterChip
          label="Meu(s) território(s)"
          active={filter.mode === 'assigned'}
          onPress={() => onChange({ mode: 'assigned' })}
        />
        <FilterChip
          label="Todos"
          active={filter.mode === 'all'}
          onPress={() => onChange({ mode: 'all' })}
        />
        {matches.map((territory) => (
          <FilterChip
            key={territory.id}
            label={territory.name}
            active={filter.mode === 'specific' && filter.territoryId === territory.id}
            onPress={() => onChange({ mode: 'specific', territoryId: territory.id })}
          />
        ))}
        {searching && matches.length === 0 && (
          <Text style={styles.noMatches}>Nenhum território com esse nome.</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mapWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    zIndex: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.warningBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    zIndex: 110,
  },
  bannerIcon: { fontSize: 16 },
  bannerText: {
    flex: 1,
    color: colors.warningText,
    fontSize: 13,
    fontWeight: '500',
  },
  // Opaque, elevated container that sits strictly above map markers
  filterContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.sm,
    zIndex: 100,
    ...shadows.md,
    elevation: 8,
  },
  searchBarRow: {
    paddingHorizontal: spacing.sm,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
    color: colors.textSecondary,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: spacing.xs,
    color: colors.textPrimary,
    fontSize: 15,
  },
  clearSearchButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchIcon: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  filterBar: {
    flexGrow: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  noMatches: {
    color: colors.textSecondary,
    paddingVertical: 7,
    paddingHorizontal: spacing.xs,
    fontSize: 14,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  filterChipPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    ...shadows.sm,
  },
  filterChipText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
  // Floating bottom card
  bottomCard: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.lg,
    zIndex: 50,
  },
  bottomCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  bottomCardInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  bottomCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  bottomCardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  badgeMine: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  badgeMineText: {
    fontSize: 12,
    color: colors.primary,
    fontWeight: '600',
  },
  clearSelectionButton: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearSelectionButtonPressed: {
    backgroundColor: colors.border,
  },
  clearSelectionText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.lg,
  },
  modalHeader: {
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  modalInfoBox: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  modalDetail: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  readOnlyHint: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontSize: 14,
  },
  textButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  textButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  textButtonLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  filledButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    ...shadows.sm,
  },
  filledButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  filledButtonDisabled: {
    opacity: 0.6,
  },
  filledButtonLabel: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
});

export default MapScreen;
