// The publisher's home screen (spec 0005, Task 23): what they worked and what
// they are currently responsible for. `session` arrives already active (the
// activation/restoration flow, Task 22/26, owns getting one) and `apiClient`
// is injected rather than created here -- this is Presentation, and per
// AGENTS.md's Arquitetura de Camadas it never talks HTTP directly. `onOpenMap`
// is wired to real navigation in Task 26; here it is just a callback.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ApiClient } from '../../data/api-client';
import { isTerritoryAssignedToMe } from '../../domain/assignment';
import type {
  PublisherWorkHistoryItem,
  Session,
  Territory,
  WorkedTerritory,
} from '../../domain/models';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, radius, shadows, spacing } from '../theme';

/**
 * Shown when either fetch rejects. `listTerritories` already falls back to
 * the offline cache one layer up (`withOfflineFallback`, App.tsx), so by the
 * time a rejection reaches this screen there genuinely is nothing to show --
 * the message says so instead of leaving a silently empty dashboard.
 */
const LOAD_ERROR_MESSAGE =
  'Não foi possível carregar os dados. Verifique a conexão e abra a tela de novo.';

export interface DashboardScreenProps {
  readonly session: Session;
  readonly apiClient: Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'> &
    Partial<Pick<ApiClient, 'listWorkHistory'>>;
  readonly onOpenMap: (territory: Territory) => void;
  /**
   * Opens the map with no preselected territory (the map's own default
   * filter decides what shows). Always available -- "Ver no mapa" only
   * exists per assigned territory, and a publisher with no assignment
   * would otherwise have no way into the map at all.
   */
  readonly onOpenFullMap: () => void;
}

type DashboardTab = 'overview' | 'history';

export function DashboardScreen({
  session,
  apiClient,
  onOpenMap,
  onOpenFullMap,
}: DashboardScreenProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [workedTerritories, setWorkedTerritories] = useState<WorkedTerritory[]>([]);
  const [workHistory, setWorkHistory] = useState<PublisherWorkHistoryItem[]>([]);
  const [assignedTerritories, setAssignedTerritories] = useState<Territory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .listWorkedTerritories(session.token)
      .then(setWorkedTerritories)
      .catch(() => setLoadError(LOAD_ERROR_MESSAGE));
  }, [apiClient, session.token]);

  useEffect(() => {
    if (typeof apiClient.listWorkHistory === 'function') {
      apiClient
        .listWorkHistory(session.token)
        .then(setWorkHistory)
        .catch(() => {
          // Non-blocking if older server or offline
        });
    }
  }, [apiClient, session.token]);

  useEffect(() => {
    apiClient
      .listTerritories(session.token)
      .then((territories) => {
        setAssignedTerritories(
          territories.filter((territory) => isTerritoryAssignedToMe(territory, session.user.id)),
        );
      })
      .catch(() => setLoadError(LOAD_ERROR_MESSAGE));
  }, [apiClient, session.token, session.user.id]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {loadError !== null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      )}

      {/* Hero Welcome Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>
              {session.user.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroGreeting}>Olá, {session.user.name}</Text>
            <Text style={styles.heroCongregation}>
              {session.congregation.name} • {session.congregation.city}
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{assignedTerritories.length}</Text>
            <Text style={styles.statLabel}>
              {assignedTerritories.length === 1 ? 'Designado' : 'Designados'}
            </Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{workedTerritories.length}</Text>
            <Text style={styles.statLabel}>
              {workedTerritories.length === 1 ? 'Trabalhado' : 'Trabalhados'}
            </Text>
          </View>
          {workHistory.length > 0 && (
            <>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={styles.statNumber}>{workHistory.length}</Text>
                <Text style={styles.statLabel}>Visitas</Text>
              </View>
            </>
          )}
        </View>
      </View>

      <PrimaryButton title="Abrir mapa" onPress={onOpenFullMap} />

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActiveTab('overview')}
          style={[styles.tabButton, activeTab === 'overview' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            Meus Territórios
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setActiveTab('history')}
          style={[styles.tabButton, activeTab === 'history' && styles.tabButtonActive]}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Histórico de Trabalho
          </Text>
        </Pressable>
      </View>

      {activeTab === 'overview' ? (
        <>
          <WorkedTerritoriesSection territories={workedTerritories} />
          <AssignedTerritoriesSection territories={assignedTerritories} onOpenMap={onOpenMap} />
        </>
      ) : (
        <WorkHistorySection history={workHistory} workedTerritories={workedTerritories} />
      )}
    </ScrollView>
  );
}

/** Section 1: what the publisher has already worked, most recent first (server-ordered). */
function WorkedTerritoriesSection({ territories }: { readonly territories: WorkedTerritory[] }) {
  return (
    <>
      <Text style={styles.heading}>Territórios trabalhados</Text>
      <View style={styles.card}>
        {territories.length === 0 ? (
          <Text style={styles.emptyText}>Nenhuma quadra trabalhada ainda</Text>
        ) : (
          territories.map((territory, index) => (
            <View key={territory.id} style={[styles.row, index > 0 && styles.rowDivided]}>
              <View style={styles.territoryRowInfo}>
                <Text style={styles.rowTitle}>{territory.name}</Text>
                <Text style={styles.rowSubtitle}>Última visita registrada</Text>
              </View>
              <View style={styles.dateBadge}>
                <Text style={styles.rowDetail}>{territory.lastWorkedAt.toLocaleDateString()}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </>
  );
}

/** Section 2: the territory (or territories) currently assigned to this publisher. */
function AssignedTerritoriesSection({
  territories,
  onOpenMap,
}: {
  readonly territories: Territory[];
  readonly onOpenMap: (territory: Territory) => void;
}) {
  return (
    <>
      <Text style={styles.heading}>Território(s) designado(s)</Text>
      <View style={styles.card}>
        {territories.length === 0 ? (
          <Text style={styles.emptyText}>
            Nenhum território designado no momento — fale com quem cuida dos territórios na
            congregação
          </Text>
        ) : (
          territories.map((territory, index) => (
            <View key={territory.id} style={[styles.row, index > 0 && styles.rowDivided]}>
              <View style={styles.territoryRowInfo}>
                <Text style={styles.rowTitle}>{territory.name}</Text>
                <Text style={styles.rowSubtitle}>
                  {territory.blocks.length} {territory.blocks.length === 1 ? 'quadra' : 'quadras'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenMap(territory)}
                style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
              >
                <Text style={styles.mapButtonText}>Ver no mapa</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </>
  );
}

/** Section 3: Detailed timeline of work history. */
function WorkHistorySection({
  history,
  workedTerritories,
}: {
  readonly history: PublisherWorkHistoryItem[];
  readonly workedTerritories: WorkedTerritory[];
}) {
  if (history.length === 0 && workedTerritories.length === 0) {
    return (
      <>
        <Text style={styles.heading}>Histórico de Trabalho</Text>
        <View style={styles.card}>
          <Text style={styles.emptyText}>Nenhuma quadra trabalhada ainda</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Text style={styles.heading}>Histórico de Trabalho</Text>
      <View style={styles.card}>
        {history.length > 0
          ? history.map((item, index) => (
              <View key={item.id} style={[styles.historyRow, index > 0 && styles.rowDivided]}>
                <View style={styles.historyBlockBadge}>
                  <Text style={styles.historyBlockNumber}>Q{item.blockNumber}</Text>
                </View>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyTerritoryName}>{item.territoryName}</Text>
                  <Text style={styles.historyDate}>
                    {item.workedAt.toLocaleDateString()} às{' '}
                    {item.workedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={styles.historyStatusBadge}>
                  <Text style={styles.historyStatusText}>✓ Feito</Text>
                </View>
              </View>
            ))
          : workedTerritories.map((item, index) => (
              <View key={item.id} style={[styles.historyRow, index > 0 && styles.rowDivided]}>
                <View style={styles.historyBlockBadge}>
                  <Text style={styles.historyBlockNumber}>📍</Text>
                </View>
                <View style={styles.historyDetails}>
                  <Text style={styles.historyTerritoryName}>{item.name}</Text>
                  <Text style={styles.historyDate}>{item.lastWorkedAt.toLocaleDateString()}</Text>
                </View>
                <View style={styles.historyStatusBadge}>
                  <Text style={styles.historyStatusText}>✓ Visitado</Text>
                </View>
              </View>
            ))}
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
  errorBanner: {
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  errorBannerText: {
    color: colors.danger,
    lineHeight: 20,
    fontSize: 14,
  },
  // Hero Card
  heroCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.sm,
    marginBottom: spacing.xs,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  heroAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAvatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  heroTextContainer: {
    flex: 1,
  },
  heroGreeting: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  heroCongregation: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  statBox: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  // Tab Bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: 3,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.surface,
    ...shadows.sm,
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
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    ...shadows.sm,
  },
  emptyText: {
    color: colors.textSecondary,
    lineHeight: 20,
    paddingVertical: spacing.lg,
    textAlign: 'center',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 14,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  territoryRowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  dateBadge: {
    backgroundColor: colors.surfaceSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowDetail: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  mapButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    ...shadows.sm,
  },
  mapButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  mapButtonText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  // Work History Timeline Item
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 12,
  },
  historyBlockBadge: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyBlockNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  historyDetails: {
    flex: 1,
    gap: 2,
  },
  historyTerritoryName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  historyDate: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  historyStatusBadge: {
    backgroundColor: colors.successSurface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  historyStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.successText,
  },
});
