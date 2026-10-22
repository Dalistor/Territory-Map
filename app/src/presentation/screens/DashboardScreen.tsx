// The publisher's home screen (spec 0005, Task 23): what they are currently
// responsible for and what they already worked. `session` arrives already
// active (the activation/restoration flow, Task 22/26, owns getting one) and
// `apiClient` is injected rather than created here -- this is Presentation,
// and per AGENTS.md's Arquitetura de Camadas it never talks HTTP directly.
// `onOpenMap` is wired to real navigation in App.tsx; here it is a callback.
//
// Spec 0018 (Task 02): every section has honest states -- loading shows grey
// rows instead of a false "nothing here", a failure stays inside its section
// with "Tentar novamente" -- and the data reloads when the publisher pulls
// down or comes back from the map, so a block just marked is reflected here.
// The overview answers "where do I work today?" first: the territories
// designated to the publisher, then what they worked.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ApiClient } from '../../data/api-client';
import { isTerritoryAssignedToMe } from '../../domain/assignment';
import { blockColorCategory } from '../../domain/blockColor';
import { formatDate, formatTime } from '../../domain/lastWorked';
import type {
  Campaign,
  PublisherWorkHistoryItem,
  Session,
  Territory,
  WorkedTerritory,
} from '../../domain/models';
import { PrimaryButton } from '../components/PrimaryButton';
import { LoadingRows, SectionError } from '../components/SectionState';
import { colors, fontSize, radius, spacing, touchTarget } from '../theme';

/**
 * Shown inside a section whose fetch rejected. `listTerritories` already
 * falls back to the offline cache one layer up (`withOfflineFallback`,
 * App.tsx), so by the time a rejection reaches this screen there genuinely
 * is nothing to show.
 */
const TERRITORIES_ERROR_MESSAGE =
  'Não foi possível carregar os territórios. Verifique a conexão.';
const WORKED_ERROR_MESSAGE =
  'Não foi possível carregar os territórios trabalhados. Verifique a conexão.';
const CAMPAIGNS_ERROR_MESSAGE =
  'Não foi possível carregar as campanhas. Verifique a conexão.';

/** The history tab shows this many entries before "Ver mais" -- the list never grows unbounded. */
const HISTORY_PAGE_SIZE = 20;

export interface DashboardScreenProps {
  readonly session: Session;
  readonly apiClient: Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'> &
    Partial<Pick<ApiClient, 'listWorkHistory' | 'listCampaigns'>>;
  readonly onOpenMap: (territory: Territory) => void;
  /** Opens the map on every territory of this campaign, with their blocks markable. */
  readonly onOpenCampaign: (campaign: Campaign) => void;
  /**
   * Opens the map with no preselected territory (the map's own default
   * filter decides what shows). Always available -- "Ver no mapa" only
   * exists per assigned territory, and a publisher with no assignment
   * would otherwise have no way into the map at all.
   */
  readonly onOpenFullMap: () => void;
  /**
   * Registers a callback fired when the publisher comes back to this screen
   * (from the map); returns the unsubscribe. App.tsx wires it to the
   * navigation's blur/focus events -- a prop, so this screen still renders
   * in tests without a `NavigationContainer`.
   */
  readonly subscribeToReturn?: (onReturn: () => void) => () => void;
  /** Injected so a fixed "now" can drive the overdue counts; defaults to the real clock. */
  readonly now?: Date;
}

type DashboardTab = 'overview' | 'campaigns' | 'history';

/** One fetch's answer: `data` stays `null` until the first success, and survives a later failure. */
interface Loadable<T> {
  readonly data: T | null;
  readonly failed: boolean;
}

const LOADING: Loadable<never> = { data: null, failed: false };

export function DashboardScreen({
  session,
  apiClient,
  onOpenMap,
  onOpenCampaign,
  onOpenFullMap,
  subscribeToReturn,
  now,
}: DashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [worked, setWorked] = useState<Loadable<WorkedTerritory[]>>(LOADING);
  const [territories, setTerritories] = useState<Loadable<Territory[]>>(LOADING);
  const [campaigns, setCampaigns] = useState<Loadable<Campaign[]>>(LOADING);
  const [workHistory, setWorkHistory] = useState<PublisherWorkHistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const loadWorked = useCallback(
    (): Promise<void> =>
      apiClient.listWorkedTerritories(session.token).then(
        (data) => {
          if (mounted.current) setWorked({ data, failed: false });
        },
        () => {
          if (mounted.current) setWorked((previous) => ({ ...previous, failed: true }));
        },
      ),
    [apiClient, session.token],
  );

  const loadTerritories = useCallback(
    (): Promise<void> =>
      apiClient.listTerritories(session.token).then(
        (data) => {
          if (mounted.current) setTerritories({ data, failed: false });
        },
        () => {
          if (mounted.current) setTerritories((previous) => ({ ...previous, failed: true }));
        },
      ),
    [apiClient, session.token],
  );

  const loadCampaigns = useCallback((): Promise<void> => {
    if (typeof apiClient.listCampaigns !== 'function') {
      setCampaigns({ data: [], failed: false });
      return Promise.resolve();
    }
    return apiClient.listCampaigns(session.token).then(
      (data) => {
          if (mounted.current) setCampaigns({ data, failed: false });
        },
      () => {
          if (mounted.current) setCampaigns((previous) => ({ ...previous, failed: true }));
        },
    );
  }, [apiClient, session.token]);

  const loadHistory = useCallback((): Promise<void> => {
    if (typeof apiClient.listWorkHistory !== 'function') return Promise.resolve();
    return apiClient.listWorkHistory(session.token).then(
      (data) => {
          if (mounted.current) setWorkHistory(data);
        },
      () => {
        // Non-blocking if older server or offline: the tab falls back to the
        // worked territories.
      },
    );
  }, [apiClient, session.token]);

  const loadAll = useCallback(
    (): Promise<unknown> =>
      Promise.all([loadWorked(), loadTerritories(), loadCampaigns(), loadHistory()]),
    [loadWorked, loadTerritories, loadCampaigns, loadHistory],
  );

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Subscribed once: the caller may hand a new function on every render, and
  // resubscribing would forget that the publisher had left for the map.
  const loadAllRef = useRef(loadAll);
  useEffect(() => {
    loadAllRef.current = loadAll;
  }, [loadAll]);
  const subscribeRef = useRef(subscribeToReturn);
  useEffect(() => subscribeRef.current?.(() => loadAllRef.current()), []);

  function handlePullToRefresh(): void {
    setRefreshing(true);
    loadAll().finally(() => {
      if (mounted.current) setRefreshing(false);
    });
  }

  const assignedTerritories =
    territories.data?.filter((territory) => isTerritoryAssignedToMe(territory, session.user.id)) ??
    null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handlePullToRefresh}
          colors={[colors.primary]}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.context}>
        {session.user.name} · {session.congregation.name}, {session.congregation.city}
      </Text>

      <PrimaryButton title="Abrir mapa" onPress={onOpenFullMap} />

      <View style={styles.tabBar} accessibilityRole="tablist" accessibilityLabel="Seções do início">
        <TabButton
          label="Início"
          active={activeTab === 'overview'}
          onPress={() => setActiveTab('overview')}
        />
        <TabButton
          label="Campanhas"
          active={activeTab === 'campaigns'}
          onPress={() => setActiveTab('campaigns')}
        />
        <TabButton
          label="Histórico"
          active={activeTab === 'history'}
          onPress={() => setActiveTab('history')}
        />
      </View>

      {activeTab === 'overview' && (
        <>
          <AssignedTerritoriesSection
            territories={assignedTerritories}
            failed={territories.failed}
            now={now ?? new Date()}
            onOpenMap={onOpenMap}
            onRetry={loadTerritories}
          />
          <WorkedTerritoriesSection
            territories={worked.data}
            failed={worked.failed}
            onRetry={loadWorked}
          />
        </>
      )}
      {activeTab === 'campaigns' && (
        <CampaignsSection
          campaigns={campaigns.data}
          failed={campaigns.failed}
          territories={territories.data ?? []}
          onOpenCampaign={onOpenCampaign}
          onRetry={loadCampaigns}
        />
      )}
      {activeTab === 'history' && (
        <WorkHistorySection
          history={workHistory}
          workedTerritories={worked.data}
          failed={worked.failed}
          onRetry={loadAll}
        />
      )}
    </ScrollView>
  );
}

/** One segment of the tab bar; the active one is raised and announced as selected. */
function TabButton({
  label,
  active,
  onPress,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.tabButton, active && styles.tabButtonActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

/** A section heading with its count in words ("2 territórios"), once the count is known. */
function SectionHeading({ title, count }: { readonly title: string; readonly count?: string }) {
  return (
    <View style={styles.headingRow}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      {count !== undefined && <Text style={styles.headingCount}>{count}</Text>}
    </View>
  );
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** "Ver no mapa": a secondary action, one per row, with a 44 dp target. */
function MapButton({ label, onPress }: { readonly label: string; readonly onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
    >
      <Text style={styles.mapButtonText}>Ver no mapa</Text>
    </Pressable>
  );
}

/**
 * The publisher's active campaigns: territories handed to a group of
 * publishers at once, any of whom may mark their blocks. Each row names the
 * campaign, how many territories it holds (and which, when the map has them)
 * and since when, and opens the map on all of them.
 */
function CampaignsSection({
  campaigns,
  failed,
  territories,
  onOpenCampaign,
  onRetry,
}: {
  readonly campaigns: Campaign[] | null;
  readonly failed: boolean;
  readonly territories: Territory[];
  readonly onOpenCampaign: (campaign: Campaign) => void;
  readonly onRetry: () => void;
}) {
  const nameOf = new Map(territories.map((territory) => [territory.id, territory.name]));
  return (
    <>
      <SectionHeading
        title="Campanhas"
        count={campaigns === null ? undefined : plural(campaigns.length, 'campanha', 'campanhas')}
      />
      <View style={styles.card}>
        {failed && <SectionError message={CAMPAIGNS_ERROR_MESSAGE} onRetry={onRetry} />}
        {campaigns === null ? (
          failed ? null : <LoadingRows label="Carregando campanhas" />
        ) : campaigns.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={styles.emptyTitle}>Você não está em nenhuma campanha agora</Text>
            <Text style={styles.emptyExplanation}>
              Numa campanha, quem cuida dos territórios designa um grupo de territórios a vários
              publicadores ao mesmo tempo, e todos podem marcar as quadras de qualquer um deles.
              Quando você for incluído numa, ela aparece aqui.
            </Text>
          </View>
        ) : (
          campaigns.map((campaign, index) => {
            const count = campaign.territoryIds.length;
            const names = campaign.territoryIds
              .map((id) => nameOf.get(id))
              .filter((name): name is string => name !== undefined);
            return (
              <View key={campaign.id} style={[styles.row, index > 0 && styles.rowDivided]}>
                <View style={styles.territoryRowInfo}>
                  <Text style={styles.rowTitle}>{campaign.name}</Text>
                  <Text style={styles.rowSubtitle}>
                    {count} {count === 1 ? 'território' : 'territórios'} · desde{' '}
                    {formatDate(campaign.startedAt)}
                  </Text>
                  {names.length > 0 && (
                    <Text style={styles.rowSubtitle} numberOfLines={2}>
                      {names.join(', ')}
                    </Text>
                  )}
                </View>
                <MapButton
                  label={`Ver ${campaign.name} no mapa`}
                  onPress={() => onOpenCampaign(campaign)}
                />
              </View>
            );
          })
        )}
      </View>
    </>
  );
}

/** What the publisher has already worked, most recent first (server-ordered). */
function WorkedTerritoriesSection({
  territories,
  failed,
  onRetry,
}: {
  readonly territories: WorkedTerritory[] | null;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  return (
    <>
      <SectionHeading
        title="Trabalhados por você"
        count={
          territories === null ? undefined : plural(territories.length, 'território', 'territórios')
        }
      />
      <View style={styles.card}>
        {failed && <SectionError message={WORKED_ERROR_MESSAGE} onRetry={onRetry} />}
        {territories === null ? (
          failed ? null : <LoadingRows label="Carregando territórios trabalhados" />
        ) : territories.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma quadra trabalhada ainda</Text>
        ) : (
          territories.map((territory, index) => (
            <View key={territory.id} style={[styles.row, index > 0 && styles.rowDivided]}>
              <View style={styles.territoryRowInfo}>
                <Text style={styles.rowTitle}>{territory.name}</Text>
                <Text style={styles.rowSubtitle}>Última visita registrada</Text>
              </View>
              <Text style={styles.rowDate}>{formatDate(territory.lastWorkedAt)}</Text>
            </View>
          ))
        )}
      </View>
    </>
  );
}

/** "12 quadras · 3 vencidas" -- the overdue count uses the same colour rule as the map. */
function blocksSummary(territory: Territory, now: Date): string {
  const overdue = territory.blocks.filter(
    (block) => blockColorCategory(block, now, territory.rotationDays) === 'overdue',
  ).length;
  const blocks = plural(territory.blocks.length, 'quadra', 'quadras');
  return overdue === 0 ? blocks : `${blocks} · ${plural(overdue, 'vencida', 'vencidas')}`;
}

/** The territory (or territories) currently assigned to this publisher -- where to work today. */
function AssignedTerritoriesSection({
  territories,
  failed,
  now,
  onOpenMap,
  onRetry,
}: {
  readonly territories: Territory[] | null;
  readonly failed: boolean;
  readonly now: Date;
  readonly onOpenMap: (territory: Territory) => void;
  readonly onRetry: () => void;
}) {
  return (
    <>
      <SectionHeading
        title="Designados a você"
        count={
          territories === null ? undefined : plural(territories.length, 'território', 'territórios')
        }
      />
      <View style={styles.card}>
        {failed && <SectionError message={TERRITORIES_ERROR_MESSAGE} onRetry={onRetry} />}
        {territories === null ? (
          failed ? null : <LoadingRows label="Carregando territórios designados" />
        ) : territories.length === 0 ? (
          <Text style={styles.emptyText}>
            Nenhum território designado no momento — fale com quem cuida dos territórios na
            congregação
          </Text>
        ) : (
          territories.map((territory, index) => (
            <View key={territory.id} style={[styles.row, index > 0 && styles.rowDivided]}>
              <View style={styles.territoryRowInfo}>
                <Text style={styles.rowTitle}>{territory.name}</Text>
                <Text style={styles.rowSubtitle}>{blocksSummary(territory, now)}</Text>
              </View>
              <MapButton
                label={`Ver ${territory.name} no mapa`}
                onPress={() => onOpenMap(territory)}
              />
            </View>
          ))
        )}
      </View>
    </>
  );
}

/** Detailed timeline of work history, capped at `HISTORY_PAGE_SIZE` with "Ver mais". */
function WorkHistorySection({
  history,
  workedTerritories,
  failed,
  onRetry,
}: {
  readonly history: PublisherWorkHistoryItem[];
  readonly workedTerritories: WorkedTerritory[] | null;
  readonly failed: boolean;
  readonly onRetry: () => void;
}) {
  const [shown, setShown] = useState(HISTORY_PAGE_SIZE);
  const total = history.length > 0 ? history.length : workedTerritories?.length ?? 0;
  const loading = history.length === 0 && workedTerritories === null && !failed;

  return (
    <>
      <SectionHeading
        title="Histórico"
        count={loading ? undefined : plural(total, 'registro', 'registros')}
      />
      <View style={styles.card}>
        {failed && history.length === 0 && (
          <SectionError message={WORKED_ERROR_MESSAGE} onRetry={onRetry} />
        )}
        {loading ? (
          <LoadingRows label="Carregando histórico" />
        ) : total === 0 ? (
          failed ? null : <Text style={styles.emptyText}>Nenhuma quadra trabalhada ainda</Text>
        ) : history.length > 0 ? (
          history.slice(0, shown).map((item, index) => (
            <View key={item.id} style={[styles.historyRow, index > 0 && styles.rowDivided]}>
              <View style={styles.historyBlockBadge}>
                <Text style={styles.historyBlockNumber}>Q{item.blockNumber}</Text>
              </View>
              <Text style={[styles.rowTitle, styles.historyName]}>{item.territoryName}</Text>
              <Text style={styles.rowDate}>
                {formatDate(item.workedAt)} às {formatTime(item.workedAt)}
              </Text>
            </View>
          ))
        ) : (
          (workedTerritories ?? []).slice(0, shown).map((item, index) => (
            <View key={item.id} style={[styles.historyRow, index > 0 && styles.rowDivided]}>
              <Text style={[styles.rowTitle, styles.historyName]}>{item.name}</Text>
              <Text style={styles.rowDate}>{formatDate(item.lastWorkedAt)}</Text>
            </View>
          ))
        )}
        {total > shown && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Ver mais registros, ${total - shown} restantes`}
            onPress={() => setShown((current) => current + HISTORY_PAGE_SIZE)}
            style={({ pressed }) => [styles.moreButton, pressed && styles.moreButtonPressed]}
          >
            <Text style={styles.moreButtonText}>Ver mais</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  context: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  // Tab bar: a segmented control. The active segment is a white surface
  // with a border, not a shadow.
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    padding: spacing.xs,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  heading: {
    fontSize: fontSize.section,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headingCount: {
    fontSize: fontSize.meta,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
    paddingVertical: spacing.lg,
    textAlign: 'center',
    fontSize: 14,
  },
  emptyBlock: {
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyExplanation: {
    color: colors.textSecondary,
    lineHeight: 20,
    fontSize: 14,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  territoryRowInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    fontSize: fontSize.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: fontSize.meta,
    color: colors.textSecondary,
  },
  rowDate: {
    fontSize: fontSize.meta,
    color: colors.textSecondary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  mapButton: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.primary,
    paddingHorizontal: spacing.md,
  },
  mapButtonPressed: {
    backgroundColor: colors.primaryLight,
  },
  mapButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingVertical: spacing.sm,
  },
  historyBlockBadge: {
    minWidth: 40,
    height: 40,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyBlockNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  historyName: {
    flex: 1,
  },
  moreButton: {
    minHeight: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  moreButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  moreButtonText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
