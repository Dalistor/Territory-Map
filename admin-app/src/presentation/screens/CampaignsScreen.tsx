// Campaigns, read only (spec 0017, Task 08): which campaigns exist, whether
// each is out in the field, and how many territories it groups. Creating,
// editing, designating, completing and deleting a campaign stay on the
// desktop admin -- this list has no button for any of them, on purpose.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Campaign } from '../../domain/models';
import { QueryListItem, QueryState } from '../components';
import { colors, spacing } from '../theme';
import { formatDate } from './BlockWorkSection';

export interface CampaignsScreenApi {
  listCampaigns(): Promise<Campaign[]>;
}

export interface CampaignsScreenSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface CampaignsScreenProps {
  readonly api: CampaignsScreenApi;
  readonly session: CampaignsScreenSession;
  readonly onOpenCampaign: (campaign: Campaign) => void;
}

const LOAD_ERROR = 'Não foi possível carregar as campanhas.';

/** Said wherever the admin might look for a way to manage a campaign here. */
export const CAMPAIGNS_DESKTOP_ONLY_MESSAGE =
  'As campanhas são criadas, designadas e concluídas no admin do computador.';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : LOAD_ERROR;
}

function territoryCountLabel(count: number): string {
  return count === 1 ? '1 território' : `${count} territórios`;
}

/** The second line of a row: since when it is out, or that it is not. */
export function campaignPeriodLabel(campaign: Campaign): string {
  const current = campaign.currentDesignation;
  if (current !== null) {
    return `Ativa desde ${formatDate(current.startedAt)}`;
  }
  return campaign.designations.length === 0 ? 'Ainda não designada' : 'Concluída';
}

export default function CampaignsScreen({
  api,
  session,
  onOpenCampaign,
}: CampaignsScreenProps): React.JSX.Element {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await session.run(() => api.listCampaigns());
      if (currentRequest === requestId.current) setCampaigns(response);
    } catch (error) {
      if (currentRequest === requestId.current) setLoadError(errorMessage(error));
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [api, session]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={styles.screen}>
      {isLoading ? (
        <QueryState kind="loading" title="Carregando campanhas" message="Aguarde um momento." />
      ) : loadError !== null ? (
        <QueryState kind="error" title="Não foi possível carregar" message={loadError} onRetry={load} />
      ) : campaigns.length === 0 ? (
        <QueryState
          kind="empty"
          title="Nenhuma campanha cadastrada"
          message={CAMPAIGNS_DESKTOP_ONLY_MESSAGE}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.note}>{CAMPAIGNS_DESKTOP_ONLY_MESSAGE}</Text>
          {campaigns.map(campaign => (
            <QueryListItem
              key={campaign.id}
              accessibilityLabel={`Abrir campanha ${campaign.name}`}
              description={campaignPeriodLabel(campaign)}
              details={[territoryCountLabel(campaign.territories.length)]}
              onPress={() => onOpenCampaign(campaign)}
              status={campaign.currentDesignation !== null ? 'Ativa' : 'Inativa'}
              title={campaign.name}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xl, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  note: { color: colors.textSecondary, fontSize: 13, marginBottom: spacing.sm },
  screen: { backgroundColor: colors.background, flex: 1, paddingTop: spacing.md },
});
