import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Publisher } from '../../domain/models';
import { QueryListItem, QuerySearchField, QueryState } from '../components';
import { colors, spacing } from '../theme';

export interface PublishersScreenApi {
  listPublishers(): Promise<Publisher[]>;
}

export interface PublishersScreenSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface PublishersScreenProps {
  readonly api: PublishersScreenApi;
  readonly session: PublishersScreenSession;
  readonly onOpenPublisher: (publisher: Publisher) => void;
}

const LOAD_ERROR = 'Não foi possível carregar os publicadores.';
const NO_RESULTS = 'Nenhum publicador corresponde à busca.';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : LOAD_ERROR;
}

function publisherStatus(publisher: Publisher): string {
  if (!publisher.isActive) return 'Inativo';
  return publisher.activatedAt === null ? 'Ainda não ativado' : 'Ativo';
}

/** Read-only catalogue of publishers. Account administration remains a desktop-only capability. */
export default function PublishersScreen({
  api,
  session,
  onOpenPublisher,
}: PublishersScreenProps): React.JSX.Element {
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await session.run(() => api.listPublishers());
      if (currentRequest === requestId.current) setPublishers(response);
    } catch (error) {
      if (currentRequest === requestId.current) setLoadError(errorMessage(error));
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [api, session]);

  useEffect(() => {
    load();
  }, [load]);

  const visiblePublishers = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    if (normalizedSearch === '') return publishers;
    return publishers.filter(publisher => publisher.name.toLocaleLowerCase().includes(normalizedSearch));
  }, [publishers, search]);

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <QuerySearchField
          accessibilityLabel="Buscar publicadores"
          onChangeText={setSearch}
          placeholder="Buscar publicadores"
          value={search}
        />
      </View>
      <View style={styles.body}>
      {isLoading ? (
        <QueryState kind="loading" title="Carregando publicadores" message="Aguarde um momento." />
      ) : loadError !== null ? (
        <QueryState kind="error" title="Não foi possível carregar" message={loadError} onRetry={load} />
      ) : publishers.length === 0 ? (
        <QueryState
          kind="empty"
          title="Nenhum publicador cadastrado"
          message="O cadastro de publicadores é feito no admin do computador."
        />
      ) : visiblePublishers.length === 0 ? (
        <QueryState kind="no-results" title="Sem resultado" message={NO_RESULTS} onClear={() => setSearch('')} />
      ) : (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          <Text style={styles.count}>
            {visiblePublishers.length === 1 ? '1 publicador' : `${visiblePublishers.length} publicadores`}
          </Text>
          {visiblePublishers.map(publisher => (
            <QueryListItem
              key={publisher.id}
              accessibilityLabel={`Abrir histórico de territórios de ${publisher.name}`}
              description="Histórico de territórios"
              onPress={() => onOpenPublisher(publisher)}
              status={publisherStatus(publisher)}
              title={publisher.name}
            />
          ))}
        </ScrollView>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  count: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginBottom: spacing.sm },
  body: { flex: 1, paddingHorizontal: spacing.md },
  controls: { paddingHorizontal: spacing.md },
  list: { gap: spacing.sm, paddingBottom: spacing.xl, paddingTop: spacing.sm },
  screen: { backgroundColor: colors.background, flex: 1, paddingTop: spacing.md },
});
