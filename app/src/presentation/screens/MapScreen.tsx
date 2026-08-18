// The publisher's map (spec 0005, Task 25): composes `TerritoryMapView`
// (`../map/TerritoryMapView.tsx`) with a filter control and the "mark this
// block as worked" flow. `session` and `apiClient` follow the same injection
// pattern `DashboardScreen.tsx` already uses -- this screen fetches its own
// territories rather than depending on whatever `DashboardScreen` happened to
// load, because the filter needs the *whole* congregation list ("Todos" and
// the per-territory picker), not just the ones assigned to this publisher.
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ApiClient } from '../../data/api-client';
import { WorkLogDrainError, type WorkLogQueue } from '../../data/work-log-queue';
import { isTerritoryAssignedToMe } from '../../domain/assignment';
import type { Block, Session, Territory } from '../../domain/models';
import { TerritoryMapView } from '../map/TerritoryMapView';
import { defaultFilter, visibleTerritories, type MapFilter } from '../map/territoryFilter';
import { colors, spacing } from '../theme';

export interface MapScreenProps {
  readonly session: Session;
  readonly apiClient: Pick<ApiClient, 'listTerritories'>;
  readonly workLogQueue: Pick<WorkLogQueue, 'enqueue' | 'drain'>;
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
  workLogQueue,
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
   * Optimistic "just marked" overrides. CLAUDE.md's offline-queue rule is
   * explicit: "A UI mostra a quadra como concluída na hora" -- the block
   * turns green immediately, before `drain` (let alone the server) confirms
   * anything.
   */
  const [justWorked, setJustWorked] = useState<Record<string, Date>>({});
  const [confirmTarget, setConfirmTarget] = useState<BlockTarget | null>(null);
  const [readOnlyTarget, setReadOnlyTarget] = useState<BlockTarget | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

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

  function handleBlockTap(territory: Territory, block: Block): void {
    if (isTerritoryAssignedToMe(territory, session.user.id)) {
      setConfirmTarget({ territory, block });
    } else {
      // Outside a territory designated to this publisher: read-only info,
      // never the option to mark it (CLAUDE.md, "Marcar quadra como
      // trabalhada" / spec 0005's designation rule).
      setReadOnlyTarget({ territory, block });
    }
  }

  async function handleConfirmWorked(): Promise<void> {
    if (confirmTarget === null) return;
    const { block } = confirmTarget;
    const workedAt = effectiveNow;
    await workLogQueue.enqueue(block.id, workedAt);
    setJustWorked((previous) => ({ ...previous, [block.id]: workedAt }));
    setConfirmTarget(null);
    try {
      await workLogQueue.drain(session.token);
    } catch (error) {
      if (error instanceof WorkLogDrainError) {
        setBanner(
          `${error.failures.length} marcação(ões) não foram aceitas pelo servidor. Fale com quem cuida dos territórios na congregação.`,
        );
      }
      // A plain network failure just leaves the item queued for the next
      // `drain` -- nothing new to tell the publisher, the block already
      // shows as done.
    }
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      {banner !== null && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{banner}</Text>
        </View>
      )}
      <FilterControl filter={filter} territories={territories} onChange={setFilter} />
      <TerritoryMapView territories={visible} now={effectiveNow} onBlockTap={handleBlockTap} />
      {confirmTarget !== null && (
        <Modal transparent animationType="fade" onRequestClose={() => setConfirmTarget(null)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                Marcar quadra {confirmTarget.block.number} como trabalhada?
              </Text>
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
                  onPress={handleConfirmWorked}
                  style={({ pressed }) => [
                    styles.filledButton,
                    pressed && styles.filledButtonPressed,
                  ]}
                >
                  <Text style={styles.filledButtonLabel}>Confirmar</Text>
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
              <Text style={styles.modalTitle}>
                Quadra {readOnlyTarget.block.number} — {readOnlyTarget.territory.name}
              </Text>
              <Text style={styles.modalDetail}>
                {readOnlyTarget.block.lastWorkedAt !== undefined
                  ? `Última visita: ${readOnlyTarget.block.lastWorkedAt.toLocaleDateString()}`
                  : 'Nunca trabalhada'}
              </Text>
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
      style={[styles.filterChip, active && styles.filterChipActive]}
    >
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** "Meu(s) território(s)" / "Todos" / one chip per individual territory. */
function FilterControl({ filter, territories, onChange }: FilterControlProps): React.JSX.Element {
  return (
    <ScrollView horizontal style={styles.filterBar} showsHorizontalScrollIndicator={false}>
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
      {territories.map((territory) => (
        <FilterChip
          key={territory.id}
          label={territory.name}
          active={filter.mode === 'specific' && filter.territoryId === territory.id}
          onPress={() => onChange({ mode: 'specific', territoryId: territory.id })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  banner: { backgroundColor: colors.warningSurface, padding: spacing.sm },
  bannerText: { color: colors.warningText },
  filterBar: { flexGrow: 0, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.textPrimary, fontSize: 14 },
  filterChipTextActive: { color: colors.onPrimary, fontWeight: '600' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.sm,
  },
  modalTitle: { fontSize: 17, fontWeight: '600', color: colors.textPrimary, marginBottom: 4 },
  modalDetail: { color: colors.textPrimary, fontSize: 15 },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  readOnlyHint: { color: colors.textSecondary, lineHeight: 20 },
  textButton: { paddingHorizontal: spacing.md, paddingVertical: 10, borderRadius: 8 },
  textButtonPressed: { backgroundColor: colors.background },
  textButtonLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: '600' },
  filledButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
  },
  filledButtonPressed: { backgroundColor: colors.primaryPressed },
  filledButtonLabel: { color: colors.onPrimary, fontSize: 15, fontWeight: '600' },
});

export default MapScreen;
