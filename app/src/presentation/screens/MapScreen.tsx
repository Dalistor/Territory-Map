// The publisher's map (spec 0005, Task 25): composes `TerritoryMapView`
// (`../map/TerritoryMapView.tsx`) with a filter control and the "mark this
// block as worked" flow. `session` and `apiClient` follow the same injection
// pattern `DashboardScreen.tsx` already uses -- this screen fetches its own
// territories rather than depending on whatever `DashboardScreen` happened to
// load, because the filter needs the *whole* congregation list ("Todos" and
// the per-territory picker), not just the ones assigned to this publisher.
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import {
  canMarkBlocksOf,
  isTerritoryAssignedToMe,
  myCampaignHolding,
} from '../../domain/assignment';
import { blockStatusLabel } from '../../domain/blockStatusLabel';
import { describeLastWorked, formatDate } from '../../domain/lastWorked';
import type { Block, Campaign, Session, Territory } from '../../domain/models';
import { TerritoryMapView } from '../map/TerritoryMapView';
import {
  defaultFilter,
  searchTerritories,
  showsBlocks,
  visibleTerritories,
  type MapFilter,
} from '../map/territoryFilter';
import { colors, fontSize, radius, shadows, spacing, touchTarget } from '../theme';

/**
 * The server's answer when the publisher is no longer allowed to mark in a
 * territory: the designation or the campaign was concluded (or they were
 * taken off it) between loading the map and tapping the block.
 */
const TERRITORY_NOT_ASSIGNED = 'territory_not_assigned';

const NO_LONGER_ASSIGNED_MESSAGE =
  'A marcação não foi registrada: este território não está mais designado a você — a designação ' +
  'ou a campanha pode ter sido concluída. O mapa foi atualizado.';

/** How long the "marked" confirmation stays on screen before it goes away on its own. */
const SUCCESS_NOTICE_MS = 4000;

/**
 * The one-line strip under the header: a short success after a marking
 * (it disappears by itself), or an error the publisher can retry and close.
 */
interface Notice {
  readonly kind: 'success' | 'error';
  readonly message: string;
  /** Present when trying again makes sense: reloads the map, or reopens the confirmation. */
  readonly retry?: () => void;
}

export interface MapScreenProps {
  readonly session: Session;
  /**
   * `listCampaigns` is optional the same way `DashboardScreen`'s
   * `listWorkHistory` is: without it the map simply knows of no campaign,
   * and only individual designations open blocks for marking.
   */
  readonly apiClient: Pick<ApiClient, 'listTerritories' | 'markBlockWorked'> &
    Partial<Pick<ApiClient, 'listCampaigns'>>;
  /** Preselects the `'specific'` filter to this territory -- how `DashboardScreen`'s "Ver no mapa" opens this screen (wired in Task 26). */
  readonly initialTerritoryId?: string;
  /**
   * Opens the map on one of the publisher's campaigns: every territory of it
   * framed together, with their blocks markable -- how the dashboard's
   * Campaigns tab opens this screen.
   */
  readonly initialCampaignId?: string;
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
  initialCampaignId,
  now,
}: MapScreenProps): React.JSX.Element {
  const effectiveNow = now ?? new Date();
  const [territories, setTerritories] = useState<Territory[]>([]);
  /** The publisher's active campaigns; `null` until the first answer (or when there is no way to ask). */
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [filter, setFilter] = useState<MapFilter>(() => initialFilter(initialTerritoryId, initialCampaignId));
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
  const [notice, setNotice] = useState<Notice | null>(null);
  /** Until the first territory list arrives the map would sit on its fallback view with nothing on it. */
  const [mapLoaded, setMapLoaded] = useState(false);
  /** What the publisher typed in the search box -- narrows the chip list and suggestions. */
  const [search, setSearch] = useState('');

  /**
   * Fetches the territories and the publisher's campaigns. Called on mount,
   * and again when the server says a territory is no longer theirs -- the
   * map must stop offering what the server now refuses.
   */
  const loadMap = useCallback((): void => {
    apiClient
      .listTerritories(session.token)
      .then((loaded) => {
        setTerritories(loaded);
        setMapLoaded(true);
      })
      // `withOfflineFallback` (App.tsx) already absorbed "no signal with a
      // cache to show"; reaching here means there is truly nothing to draw.
      .catch(() => {
        setMapLoaded(true);
        setNotice({
          kind: 'error',
          message: 'Não foi possível carregar os territórios. Verifique a conexão.',
          retry: () => {
            setNotice(null);
            setMapLoaded(false);
            loadMap();
          },
        });
      });
    // Without the list no campaign territory is offered for marking, which
    // errs on the side the server enforces anyway.
    if (apiClient.listCampaigns === undefined) {
      setCampaigns([]);
      return;
    }
    apiClient
      .listCampaigns(session.token)
      .then(setCampaigns)
      .catch(() => setCampaigns([]));
  }, [apiClient, session.token]);

  useEffect(loadMap, [loadMap]);

  useEffect(() => {
    if (notice?.kind !== 'success') return undefined;
    const timer = setTimeout(() => setNotice(null), SUCCESS_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  const myCampaigns = campaigns ?? NO_CAMPAIGNS;

  useEffect(() => {
    if (
      filterInitialized ||
      initialTerritoryId !== undefined ||
      initialCampaignId !== undefined ||
      territories.length === 0
    ) {
      return;
    }
    setFilter(defaultFilter(territories, session.user.id));
    setFilterInitialized(true);
  }, [territories, filterInitialized, initialTerritoryId, initialCampaignId, session.user.id]);

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
    () => visibleTerritories(territoriesWithOverrides, filter, session.user.id, myCampaigns),
    [territoriesWithOverrides, filter, session.user.id, myCampaigns],
  );

  const selectedTerritory = useMemo(
    () =>
      filter.mode === 'specific'
        ? territories.find((t) => t.id === filter.territoryId) ?? null
        : null,
    [territories, filter],
  );

  const selectedTerritoryCampaign =
    selectedTerritory === null ? undefined : myCampaignHolding(selectedTerritory, myCampaigns);

  const selectedCampaign =
    filter.mode === 'campaign'
      ? myCampaigns.find((campaign) => campaign.id === filter.campaignId) ?? null
      : null;

  function handleBlockTap(territory: Territory, block: Block): void {
    if (canMarkBlocksOf(territory, session.user.id, myCampaigns)) {
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
    const target = confirmTarget;
    const { block } = target;
    const reopen = (): void => {
      setNotice(null);
      setConfirmTarget(target);
    };
    const workedAt = effectiveNow;
    setSaving(true);
    try {
      await apiClient.markBlockWorked(session.token, block.id, uuidv4(), workedAt);
    } catch (error) {
      if (error instanceof NetworkException) {
        setNotice({
          kind: 'error',
          message:
            'Sem conexão com o servidor: a marcação não foi registrada. Tente de novo quando houver internet.',
          retry: reopen,
        });
      } else if (error instanceof ApiErrorException && error.code === TERRITORY_NOT_ASSIGNED) {
        setNotice({ kind: 'error', message: NO_LONGER_ASSIGNED_MESSAGE });
        loadMap();
      } else if (error instanceof ApiErrorException) {
        // The server's own words -- "território não designado", "quadra não
        // encontrada" -- say more than anything this screen could guess.
        setNotice({ kind: 'error', message: `A marcação não foi registrada: ${error.detail}` });
      } else {
        setNotice({
          kind: 'error',
          message: 'A marcação não foi registrada. Tente novamente.',
          retry: reopen,
        });
      }
      return;
    } finally {
      setSaving(false);
      setConfirmTarget(null);
    }
    setNotice({
      kind: 'success',
      message: `Quadra ${block.number} marcada como trabalhada`,
    });
    setJustWorked((previous) => ({ ...previous, [block.id]: workedAt }));
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.container}>
      {notice !== null && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}
      <FilterControl
        filter={filter}
        territories={territories}
        campaigns={myCampaigns}
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
          myCampaigns={myCampaigns}
          // The overview shows names over the demarcations; the blocks and
          // their numbers appear once a single territory or a campaign is
          // picked. A campaign keeps the names too: it draws several
          // territories' blocks at once.
          showBlocks={showsBlocks(filter)}
          showTerritoryLabels={filter.mode !== 'specific'}
          now={effectiveNow}
          onBlockTap={handleBlockTap}
          onTerritoryTap={(territory) =>
            setFilter({ mode: 'specific', territoryId: territory.id })
          }
        />
        {!mapLoaded && (
          <View
            accessible
            accessibilityLabel="Carregando territórios"
            accessibilityState={{ busy: true }}
            style={styles.loadingOverlay}
          >
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.loadingText}>Carregando territórios…</Text>
          </View>
        )}
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
                  {selectedTerritoryCampaign !== undefined ? (
                    <View style={[styles.badge, styles.badgeMine]}>
                      <Text style={styles.badgeMineText}>
                        Campanha: {selectedTerritoryCampaign.name}
                      </Text>
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
        {filter.mode === 'campaign' && (
          <CampaignCard
            campaign={selectedCampaign}
            loaded={campaigns !== null}
            onShowAll={() => setFilter({ mode: 'all' })}
          />
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
              <BlockStatusBox
                label="Status recente:"
                target={confirmTarget}
                now={effectiveNow}
              />
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirmTarget(null)}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
                >
                  <Text style={styles.textButtonLabel}>Cancelar</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: saving, busy: saving }}
                  disabled={saving}
                  onPress={handleConfirmWorked}
                  style={({ pressed }) => [
                    styles.filledButton,
                    pressed && styles.filledButtonPressed,
                    saving && styles.filledButtonDisabled,
                  ]}
                >
                  <Text style={styles.filledButtonLabel}>
                    {saving ? 'Registrando…' : 'Marcar como trabalhada'}
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
              <BlockStatusBox label="Status:" target={readOnlyTarget} now={effectiveNow} />
              <Text style={styles.readOnlyHint}>
                Este território não está designado a você — fale com quem cuida dos territórios na
                congregação para poder marcar quadras aqui.
              </Text>
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReadOnlyTarget(null)}
                  style={({ pressed }) => [
                    styles.secondaryButton,
                    pressed && styles.secondaryButtonPressed,
                  ]}
                >
                  <Text style={styles.secondaryButtonLabel}>Fechar</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const NO_CAMPAIGNS: readonly Campaign[] = [];

/**
 * The block's status in words (honouring a status the admin forced) and when
 * it was last worked. When the two say the same thing ("Nunca trabalhada"),
 * it is said once.
 */
function BlockStatusBox({
  label,
  target,
  now,
}: {
  readonly label: string;
  readonly target: BlockTarget;
  readonly now: Date;
}): React.JSX.Element {
  const status = blockStatusLabel(target.block, now, target.territory.rotationDays);
  const lastWorked = describeLastWorked(target.block, now);
  return (
    <View style={styles.modalInfoBox}>
      <Text style={styles.modalInfoLabel}>{label}</Text>
      {status !== lastWorked && <Text style={styles.modalDetail}>{status}</Text>}
      <Text style={status === lastWorked ? styles.modalDetail : styles.modalDetailSecondary}>
        {lastWorked}
      </Text>
    </View>
  );
}

/** The strip under the header: success fades on its own; an error offers retry (when it helps) and close. */
function NoticeBar({
  notice,
  onClose,
}: {
  readonly notice: Notice;
  readonly onClose: () => void;
}): React.JSX.Element {
  const isError = notice.kind === 'error';
  return (
    <View style={[styles.banner, isError ? styles.bannerError : styles.bannerSuccess]}>
      <Text
        accessibilityRole={isError ? 'alert' : 'text'}
        accessibilityLiveRegion="polite"
        style={[styles.bannerText, isError ? styles.bannerTextError : styles.bannerTextSuccess]}
      >
        {notice.message}
      </Text>
      {isError && (
        <View style={styles.bannerActions}>
          {notice.retry !== undefined && (
            <Pressable
              accessibilityRole="button"
              onPress={notice.retry}
              style={({ pressed }) => [styles.bannerButton, pressed && styles.bannerButtonPressed]}
            >
              <Text style={styles.bannerButtonPrimaryText}>Tentar novamente</Text>
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar aviso"
            onPress={onClose}
            style={({ pressed }) => [styles.bannerButton, pressed && styles.bannerButtonPressed]}
          >
            <Text style={styles.bannerButtonText}>Fechar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function initialFilter(territoryId?: string, campaignId?: string): MapFilter {
  if (campaignId !== undefined) return { mode: 'campaign', campaignId };
  if (territoryId !== undefined) return { mode: 'specific', territoryId };
  return { mode: 'all' };
}

/**
 * The floating card of campaign mode: which campaign is on the map, how many
 * territories it holds and since when. Once the campaign list has arrived and
 * this one is not in it, says so instead of showing an empty map in silence.
 */
function CampaignCard({
  campaign,
  loaded,
  onShowAll,
}: {
  readonly campaign: Campaign | null;
  readonly loaded: boolean;
  readonly onShowAll: () => void;
}): React.JSX.Element | null {
  if (campaign === null && !loaded) return null;
  const count = campaign?.territoryIds.length ?? 0;
  return (
    <View style={styles.bottomCard}>
      <View style={styles.bottomCardHeader}>
        <View style={styles.bottomCardInfo}>
          {campaign === null ? (
            <Text style={styles.readOnlyHint}>
              Esta campanha não está mais ativa para você — ela pode ter sido concluída.
            </Text>
          ) : (
            <>
              <Text style={styles.bottomCardTitle}>{campaign.name}</Text>
              <Text style={styles.badgeText}>
                {count} {count === 1 ? 'território' : 'territórios'} · desde{' '}
                {formatDate(campaign.startedAt)}
              </Text>
            </>
          )}
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={onShowAll}
          style={({ pressed }) => [
            styles.clearSelectionButton,
            pressed && styles.clearSelectionButtonPressed,
          ]}
        >
          <Text style={styles.clearSelectionText}>Ver todos</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface FilterControlProps {
  readonly filter: MapFilter;
  readonly territories: Territory[];
  /** The publisher's active campaigns -- one chip each, so the campaign view is one tap away again. */
  readonly campaigns: readonly Campaign[];
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
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
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
 * chip per active campaign of the publisher / one chip per individual
 * territory.
 *
 * The search narrows the chips and displays instant suggestions.
 * An explicit "Limpar" button ensures reliable clearing on Android.
 */
function FilterControl({
  filter,
  territories,
  campaigns,
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
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={onSearchChange}
            placeholder="Buscar território pelo nome"
            placeholderTextColor={colors.textPlaceholder}
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
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <Text style={styles.clearSearchText}>Limpar</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView
        horizontal
        accessibilityRole="radiogroup"
        accessibilityLabel="Filtro do mapa"
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
        showsHorizontalScrollIndicator={false}
      >
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
        {campaigns.map((campaign) => (
          <FilterChip
            key={campaign.id}
            label={`Campanha: ${campaign.name}`}
            active={filter.mode === 'campaign' && filter.campaignId === campaign.id}
            onPress={() => onChange({ mode: 'campaign', campaignId: campaign.id })}
          />
        ))}
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
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    zIndex: 110,
  },
  bannerError: {
    backgroundColor: colors.dangerSurface,
    borderBottomColor: colors.dangerBorder,
  },
  bannerSuccess: {
    backgroundColor: colors.successSurface,
    borderBottomColor: colors.successBorder,
  },
  bannerText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  bannerTextError: {
    color: colors.danger,
  },
  bannerTextSuccess: {
    color: colors.successText,
  },
  bannerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  bannerButton: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  bannerButtonPressed: {
    backgroundColor: colors.surface,
  },
  bannerButtonPrimaryText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  bannerButtonText: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '500',
  },
  loadingOverlay: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.mapOverlay,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    zIndex: 60,
    ...shadows.sm,
  },
  loadingText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  // Opaque container that sits strictly above map markers; flat, separated
  // from the map by its bottom border (DESIGN.md: shadows only on what floats).
  filterContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.sm,
    zIndex: 100,
  },
  searchBarRow: {
    paddingHorizontal: spacing.md,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderInput,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    minHeight: touchTarget.min,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: fontSize.body,
  },
  clearSearchButton: {
    minHeight: touchTarget.min - 8,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
  },
  filterBar: {
    flexGrow: 0,
  },
  filterBarContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  noMatches: {
    color: colors.textSecondary,
    paddingHorizontal: spacing.xs,
    fontSize: 14,
  },
  filterChip: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
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
  // Floating bottom card: the one surface that floats over the map, so the
  // one that keeps a shadow.
  bottomCard: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
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
    fontSize: fontSize.section,
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
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    fontSize: fontSize.small,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  badgeMine: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  badgeMineText: {
    fontSize: fontSize.small,
    color: colors.primary,
    fontWeight: '600',
  },
  clearSelectionButton: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearSelectionButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  clearSelectionText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadows.md,
  },
  modalHeader: {
    gap: spacing.xs,
  },
  modalTitle: {
    fontSize: fontSize.title,
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
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalInfoLabel: {
    fontSize: fontSize.meta,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalDetail: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '500',
  },
  modalDetailSecondary: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  readOnlyHint: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontSize: 14,
  },
  secondaryButton: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  secondaryButtonLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  textButtonLabel: {
    color: colors.textPrimary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
  filledButton: {
    minHeight: touchTarget.comfortable,
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.lg,
  },
  filledButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  filledButtonDisabled: {
    opacity: 0.6,
  },
  filledButtonLabel: {
    color: colors.onPrimary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});

export default MapScreen;
