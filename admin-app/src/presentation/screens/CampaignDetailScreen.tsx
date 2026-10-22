// One campaign, read only (spec 0017, Task 08): its territories, who works it
// now and every period it has been out. A stack screen opened from
// `CampaignsScreen`; like the list, it offers no way to change anything.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { compareTerritoriesByNumber } from '../../domain/models';
import type { Campaign, CampaignDesignation } from '../../domain/models';
import { QueryState } from '../components';
import { colors, radius, spacing } from '../theme';
import { formatDate } from './BlockWorkSection';
import { CAMPAIGNS_DESKTOP_ONLY_MESSAGE, campaignPeriodLabel } from './CampaignsScreen';

export interface CampaignDetailScreenApi {
  getCampaign(campaignId: string): Promise<Campaign>;
}

export interface CampaignDetailScreenSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface CampaignDetailScreenProps {
  readonly campaignId: string;
  readonly api: CampaignDetailScreenApi;
  readonly session: CampaignDetailScreenSession;
}

const LOAD_ERROR = 'Não foi possível carregar a campanha.';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : LOAD_ERROR;
}

function publishersLabel(designation: CampaignDesignation): string {
  return designation.publishers.length === 0
    ? 'Nenhum publicador'
    : designation.publishers.map(publisher => publisher.name).join(', ');
}

function periodLabel(designation: CampaignDesignation): string {
  const end =
    designation.completedAt === null
      ? 'Em andamento'
      : `Devolução ${formatDate(designation.completedAt)}`;
  return `Retirada ${formatDate(designation.startedAt)} · ${end}`;
}

export default function CampaignDetailScreen({
  campaignId,
  api,
  session,
}: CampaignDetailScreenProps): React.JSX.Element {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await session.run(() => api.getCampaign(campaignId));
      if (currentRequest === requestId.current) setCampaign(response);
    } catch (error) {
      if (currentRequest === requestId.current) setLoadError(errorMessage(error));
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [api, campaignId, session]);

  useEffect(() => {
    load();
  }, [load]);

  // The congregation reads its territories by number, here as on every list.
  const territories = useMemo(
    () =>
      campaign === null
        ? []
        : [...campaign.territories].sort((a, b) => compareTerritoriesByNumber(a.name, b.name)),
    [campaign],
  );

  if (isLoading) {
    return (
      <View style={styles.screen}>
        <QueryState kind="loading" title="Carregando campanha" message="Aguarde um momento." />
      </View>
    );
  }
  if (loadError !== null || campaign === null) {
    return (
      <View style={styles.screen}>
        <QueryState kind="error" title="Não foi possível carregar" message={loadError ?? LOAD_ERROR} onRetry={load} />
      </View>
    );
  }

  const current = campaign.currentDesignation;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.title}>{campaign.name}</Text>
        <Text style={styles.summaryText}>{campaignPeriodLabel(campaign)}</Text>
        <Text style={styles.note}>{CAMPAIGNS_DESKTOP_ONLY_MESSAGE}</Text>
      </View>

      <Text style={styles.heading}>Publicadores designados</Text>
      <Text style={current === null ? styles.muted : styles.body}>
        {current === null ? 'A campanha não está designada agora.' : publishersLabel(current)}
      </Text>

      <Text style={styles.heading}>Territórios ({territories.length})</Text>
      {/* A plain list, not cards: these names are read here, not opened. */}
      <View style={styles.territoryList}>
        {territories.map((territory, index) => (
          <Text
            key={territory.id}
            style={[styles.territoryRow, index > 0 && styles.territoryRowDivided]}>
            {territory.name}
          </Text>
        ))}
      </View>

      <Text style={styles.heading}>Períodos</Text>
      {campaign.designations.length === 0 ? (
        <Text style={styles.muted}>Nenhum período ainda.</Text>
      ) : (
        campaign.designations.map(designation => (
          <View key={designation.id} style={styles.period} testID="campaign-period">
            <Text style={styles.periodDates}>{periodLabel(designation)}</Text>
            <Text style={styles.body}>{publishersLabel(designation)}</Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { color: colors.textPrimary, fontSize: 15 },
  content: { gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xl },
  heading: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: spacing.md },
  muted: { color: colors.textSecondary },
  note: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.sm },
  period: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  periodDates: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  territoryList: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  territoryRow: {
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: spacing.sm,
  },
  territoryRowDivided: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
  },
  screen: { backgroundColor: colors.background, flex: 1 },
  summary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  summaryText: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700' },
});
