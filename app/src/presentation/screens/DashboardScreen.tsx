// The publisher's home screen (spec 0005, Task 23): what they worked and what
// they are currently responsible for. `session` arrives already active (the
// activation/restoration flow, Task 22/26, owns getting one) and `apiClient`
// is injected rather than created here -- this is Presentation, and per
// CLAUDE.md's Arquitetura de Camadas it never talks HTTP directly. `onOpenMap`
// is wired to real navigation in Task 26; here it is just a callback.
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import type { ApiClient } from '../../data/api-client'
import { isTerritoryAssignedToMe } from '../../domain/assignment'
import type { Session, Territory, WorkedTerritory } from '../../domain/models'
import { PrimaryButton } from '../components/PrimaryButton'
import { colors, spacing } from '../theme'

/**
 * Shown when either fetch rejects. `listTerritories` already falls back to
 * the offline cache one layer up (`withOfflineFallback`, App.tsx), so by the
 * time a rejection reaches this screen there genuinely is nothing to show --
 * the message says so instead of leaving a silently empty dashboard.
 */
const LOAD_ERROR_MESSAGE =
  'Não foi possível carregar os dados. Verifique a conexão e abra a tela de novo.'

export interface DashboardScreenProps {
  readonly session: Session
  readonly apiClient: Pick<ApiClient, 'listWorkedTerritories' | 'listTerritories'>
  readonly onOpenMap: (territory: Territory) => void
  /**
   * Opens the map with no preselected territory (the map's own default
   * filter decides what shows). Always available -- "Ver no mapa" only
   * exists per assigned territory, and a publisher with no assignment
   * would otherwise have no way into the map at all.
   */
  readonly onOpenFullMap: () => void
}

export function DashboardScreen({
  session,
  apiClient,
  onOpenMap,
  onOpenFullMap
}: DashboardScreenProps) {
  const [workedTerritories, setWorkedTerritories] = useState<WorkedTerritory[]>([])
  const [assignedTerritories, setAssignedTerritories] = useState<Territory[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    apiClient
      .listWorkedTerritories(session.token)
      .then(setWorkedTerritories)
      .catch(() => setLoadError(LOAD_ERROR_MESSAGE))
  }, [apiClient, session.token])

  useEffect(() => {
    apiClient
      .listTerritories(session.token)
      .then((territories) => {
        setAssignedTerritories(
          territories.filter((territory) => isTerritoryAssignedToMe(territory, session.user.id))
        )
      })
      .catch(() => setLoadError(LOAD_ERROR_MESSAGE))
  }, [apiClient, session.token, session.user.id])

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {loadError !== null && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </View>
      )}
      <PrimaryButton title="Abrir mapa" onPress={onOpenFullMap} />
      <WorkedTerritoriesSection territories={workedTerritories} />
      <AssignedTerritoriesSection territories={assignedTerritories} onOpenMap={onOpenMap} />
    </ScrollView>
  )
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
              <Text style={styles.rowTitle}>{territory.name}</Text>
              <Text style={styles.rowDetail}>{territory.lastWorkedAt.toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </View>
    </>
  )
}

/** Section 2: the territory (or territories) currently assigned to this publisher. */
function AssignedTerritoriesSection({
  territories,
  onOpenMap
}: {
  readonly territories: Territory[]
  readonly onOpenMap: (territory: Territory) => void
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
              <Text style={styles.rowTitle}>{territory.name}</Text>
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
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: spacing.md, paddingBottom: spacing.xl },
  errorBanner: {
    backgroundColor: colors.dangerSurface,
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.sm
  },
  errorBannerText: { color: colors.danger, lineHeight: 20 },
  heading: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: spacing.md,
    marginBottom: spacing.sm
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md
  },
  emptyText: { color: colors.textSecondary, lineHeight: 20, paddingVertical: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: 12
  },
  rowDivided: { borderTopWidth: 1, borderTopColor: colors.border },
  rowTitle: { flex: 1, fontSize: 16, color: colors.textPrimary },
  rowDetail: { fontSize: 14, color: colors.textSecondary },
  mapButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 6
  },
  mapButtonPressed: { backgroundColor: colors.primaryPressed },
  mapButtonText: { color: colors.onPrimary, fontSize: 14, fontWeight: '600' }
})
