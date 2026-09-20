import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { AssignmentHistoryPage, AssignmentWithTerritory, PublisherBrief } from '../../domain/models';
import { QueryPagination, QueryState } from '../components';
import { colors, radius, shadows, spacing } from '../theme';
import { formatDate } from './BlockWorkSection';

export interface PublisherHistoryScreenApi {
  listAllAssignments(filters: { publisherId: string; page: number }): Promise<AssignmentHistoryPage>;
}

export interface PublisherHistoryScreenSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface PublisherHistoryScreenProps {
  readonly api: PublisherHistoryScreenApi;
  readonly session: PublisherHistoryScreenSession;
  readonly publisher: PublisherBrief;
}

const LOAD_ERROR = 'Não foi possível carregar o histórico de territórios.';

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== '' ? error.message : LOAD_ERROR;
}

function assignmentStatus(assignment: AssignmentWithTerritory): string {
  return assignment.completedAt === null ? 'Em andamento' : 'Devolvido';
}

/** Stack detail for a publisher's assignment history; it never offers account-management actions. */
export default function PublisherHistoryScreen({
  api,
  publisher,
  session,
}: PublisherHistoryScreenProps): React.JSX.Element {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<AssignmentHistoryPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (pageToLoad: number) => {
    const currentRequest = ++requestId.current;
    setIsLoading(true);
    setLoadError(null);
    try {
      const response = await session.run(() =>
        api.listAllAssignments({ publisherId: publisher.id, page: pageToLoad }),
      );
      if (currentRequest === requestId.current) setHistory(response);
    } catch (error) {
      if (currentRequest === requestId.current) setLoadError(errorMessage(error));
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [api, publisher.id, session]);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const changePage = useCallback((nextPage: number) => setPage(nextPage), []);
  const retry = useCallback(() => load(page), [load, page]);
  const hasNoHistory = history !== null && history.total === 0;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.publisherSummary}>
          <View accessibilityElementsHidden style={styles.avatar}>
            <Text style={styles.avatarText}>{publisher.name.charAt(0).toLocaleUpperCase('pt-BR')}</Text>
          </View>
          <View style={styles.publisherIdentity}>
            <Text style={styles.publisherCaption}>Histórico de territórios</Text>
            <Text accessibilityRole="header" style={styles.publisherName}>{publisher.name}</Text>
            {history !== null && !isLoading && loadError === null && (
              <Text style={styles.publisherCount}>
                {history.total} {history.total === 1 ? 'território retirado' : 'territórios retirados'}
              </Text>
            )}
          </View>
        </View>
        {isLoading ? (
          <QueryState kind="loading" title="Carregando histórico" message="Aguarde um momento." />
        ) : loadError !== null ? (
          <QueryState kind="error" title="Não foi possível carregar" message={loadError} onRetry={retry} />
        ) : hasNoHistory ? (
          <QueryState
            kind="empty"
            title="Sem histórico de territórios"
            message={`${publisher.name} ainda não retirou nenhum território.`}
          />
        ) : history !== null ? (
          <>
            {history.items.map(assignment => (
              <View
                key={assignment.id}
                accessible
                accessibilityLabel={`${assignment.territory.name}. ${assignmentStatus(assignment)}. Retirada em ${formatDate(assignment.startedAt)}${assignment.completedAt === null ? '' : `. Devolvida em ${formatDate(assignment.completedAt)}`}`}
                style={styles.assignment}>
                <View style={styles.assignmentHeading}>
                  <Text style={styles.territoryName}>{assignment.territory.name}</Text>
                  <Text style={[styles.status, assignment.completedAt === null ? styles.statusOngoing : styles.statusReturned]}>
                    {assignmentStatus(assignment)}
                  </Text>
                </View>
                <View style={styles.period}>
                  <View style={styles.dateBlock}>
                    <Text style={styles.dateLabel}>RETIRADA</Text>
                    <Text style={styles.dateValue}>{formatDate(assignment.startedAt)}</Text>
                  </View>
                  <View accessibilityElementsHidden style={styles.periodLine}>
                    <View style={styles.periodDot} />
                    <View style={styles.periodRule} />
                    <View style={[styles.periodDot, assignment.completedAt === null && styles.periodDotOpen]} />
                  </View>
                  <View style={[styles.dateBlock, styles.dateBlockEnd]}>
                    <Text style={styles.dateLabel}>DEVOLUÇÃO</Text>
                    <Text style={styles.dateValue}>
                      {assignment.completedAt === null ? '—' : formatDate(assignment.completedAt)}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
            <QueryPagination
              isBusy={isLoading}
              onPageChange={changePage}
              page={history.page}
              pageSize={history.pageSize}
              total={history.total}
            />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: colors.primaryLight, borderRadius: radius.full, height: 52, justifyContent: 'center', width: 52 },
  avatarText: { color: colors.primaryPressed, fontSize: 20, fontWeight: '800' },
  assignment: {
    ...shadows.sm,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
    padding: spacing.md,
  },
  assignmentHeading: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  dateBlock: { flex: 1 },
  dateBlockEnd: { alignItems: 'flex-end' },
  dateLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  dateValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginTop: 3 },
  period: { alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderRadius: radius.sm, flexDirection: 'row', marginTop: spacing.md, padding: spacing.sm },
  periodDot: { backgroundColor: colors.primary, borderRadius: radius.full, height: 8, width: 8 },
  periodDotOpen: { backgroundColor: colors.surface, borderColor: colors.warningText, borderWidth: 2 },
  periodLine: { alignItems: 'center', flexDirection: 'row', marginHorizontal: spacing.sm, width: 48 },
  periodRule: { backgroundColor: colors.borderStrong, flex: 1, height: 2 },
  publisherCaption: { color: colors.primaryPressed, fontSize: 11, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  publisherCount: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  publisherIdentity: { flex: 1, minWidth: 0 },
  publisherName: { color: colors.textPrimary, fontSize: 22, fontWeight: '800', marginTop: 2 },
  publisherSummary: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg, padding: spacing.md, ...shadows.sm },
  screen: { backgroundColor: colors.background, flex: 1 },
  status: { borderRadius: radius.full, fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusOngoing: { backgroundColor: colors.warningSurface, color: colors.warningText },
  statusReturned: { backgroundColor: colors.successSurface, color: colors.successText },
  territoryName: { color: colors.textPrimary, flex: 1, fontSize: 16, fontWeight: '700' },
});
