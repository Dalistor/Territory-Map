import React, { useCallback, useEffect, useRef, useState } from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AssignmentHistoryFilters, AssignmentHistoryPage, AssignmentWithTerritory } from '../../domain/models';
import {
  QueryPagination,
  QueryState,
} from '../components';
import { colors, radius, shadows, spacing } from '../theme';

const PAGE_SIZE = 50;

export interface HistoryScreenApi {
  listAllAssignments(filters?: AssignmentHistoryFilters): Promise<AssignmentHistoryPage>;
}

export interface HistoryScreenSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface HistoryScreenProps {
  readonly api: HistoryScreenApi;
  readonly session: HistoryScreenSession;
  /** Test seams and a way to restore a tab state from a navigator if it ever unmounts it. */
  readonly initialFrom?: Date;
  readonly initialTo?: Date;
}

type DateField = 'from' | 'to';

interface SelectedDays {
  readonly from: Date | undefined;
  readonly to: Date | undefined;
}

/**
 * The API speaks instants, while a person selecting 12/09 means the whole
 * local calendar day. The end is therefore the next local midnight, which
 * creates the `[from, to)` interval the server's overlap query expects.
 */
export function localDayRange(from: Date, to: Date): { readonly from: Date; readonly to: Date } {
  const inclusiveStart = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const exclusiveEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
  return { from: inclusiveStart, to: exclusiveEnd };
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message !== ''
    ? error.message
    : 'Não foi possível carregar o histórico.';
}

function filtersFor(days: SelectedDays, page: number): AssignmentHistoryFilters {
  if (days.from !== undefined && days.to !== undefined) {
    return { ...localDayRange(days.from, days.to), page, pageSize: PAGE_SIZE };
  }
  return {
    ...(days.from === undefined ? {} : { from: new Date(days.from.getFullYear(), days.from.getMonth(), days.from.getDate()) }),
    ...(days.to === undefined ? {} : { to: new Date(days.to.getFullYear(), days.to.getMonth(), days.to.getDate() + 1) }),
    page,
    pageSize: PAGE_SIZE,
  };
}

function assignmentDetails(assignment: AssignmentWithTerritory): readonly string[] {
  return [
    `Retirada: ${formatDate(assignment.startedAt)}`,
    assignment.completedAt === null ? 'Devolução: —' : `Devolução: ${formatDate(assignment.completedAt)}`,
  ];
}

/** Read-only congregation-wide assignment history, intentionally with no destructive action. */
export default function HistoryScreen({
  api,
  session,
  initialFrom,
  initialTo,
}: HistoryScreenProps): React.JSX.Element {
  const [days, setDays] = useState<SelectedDays>({ from: initialFrom, to: initialTo });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AssignmentHistoryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const queryVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++queryVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await session.run(() => api.listAllAssignments(filtersFor(days, page)));
      if (version === queryVersion.current) setResult(next);
    } catch (caught) {
      if (version === queryVersion.current) setError(errorMessage(caught));
    } finally {
      if (version === queryVersion.current) setIsLoading(false);
    }
  }, [api, days, page, session]);

  useEffect(() => {
    load();
  }, [load]);

  const changeDay = useCallback((field: DateField, selected: Date | undefined) => {
    if (selected === undefined) return;
    setPickerField(null);
    setPage(1);
    setDays(current => ({ ...current, [field]: selected }));
  }, []);

  const clearPeriod = useCallback(() => {
    setPickerField(null);
    setPage(1);
    setDays({ from: undefined, to: undefined });
  }, []);

  const hasPeriod = days.from !== undefined || days.to !== undefined;
  const hasItems = result !== null && result.items.length > 0;
  const hasPeriodFilter = days.from !== undefined || days.to !== undefined;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <Text accessibilityRole="header" style={styles.title}>Histórico completo</Text>
          <Text style={styles.subtitle}>Designações que se sobrepõem ao período selecionado.</Text>
        </View>

        <View accessibilityLabel="Período" style={styles.periodCard}>
          <Text style={styles.periodTitle}>Período</Text>
          <View style={styles.dateRow}>
            <DateButton
              label="De"
              accessibilityLabel="Data inicial"
              value={days.from}
              onPress={() => setPickerField('from')}
            />
            <DateButton
              label="Até"
              accessibilityLabel="Data final"
              value={days.to}
              onPress={() => setPickerField('to')}
            />
          </View>
          {hasPeriod && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Limpar período"
              onPress={clearPeriod}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}>
              <Text style={styles.clearText}>Limpar período</Text>
            </Pressable>
          )}
        </View>

        {pickerField !== null && (
          <DateTimePicker
            display="default"
            mode="date"
            onChange={(event, selected) => {
              if (event.type !== 'dismissed') changeDay(pickerField, selected);
              else setPickerField(null);
            }}
            value={days[pickerField] ?? new Date()}
          />
        )}

        {isLoading && result === null && (
          <QueryState kind="loading" title="Carregando histórico" message="Buscando designações…" />
        )}

        {error !== null && (
          <QueryState kind="error" title="Não foi possível carregar" message={error} onRetry={load} />
        )}

        {!isLoading && error === null && result !== null && !hasItems && (
          <QueryState
            kind={hasPeriodFilter ? 'no-results' : 'empty'}
            title={hasPeriodFilter ? 'Sem resultados neste período' : 'Histórico vazio'}
            message={hasPeriodFilter
              ? 'Nenhuma designação se sobrepõe ao período escolhido.'
              : 'Ainda não há designações registradas.'}
          />
        )}

        {hasItems && result !== null && (
          <View style={styles.cards}>
            {result.items.map(assignment => (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
              />
            ))}
          </View>
        )}

        {result !== null && error === null && (
          <QueryPagination
            isBusy={isLoading}
            onPageChange={setPage}
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
          />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A history row is deliberately static: this surface consults, it does not edit assignments. */
function AssignmentCard({ assignment }: { readonly assignment: AssignmentWithTerritory }): React.JSX.Element {
  const ongoing = assignment.completedAt === null;
  return (
    <View accessibilityLabel={`${assignment.territory.name}, ${assignment.publisher.name}`} style={styles.assignmentCard}>
      <View style={styles.assignmentContent}>
        <Text style={styles.assignmentTitle}>{assignment.territory.name}</Text>
        <Text style={styles.assignmentPublisher}>{assignment.publisher.name}</Text>
        <Text style={styles.assignmentDates}>{assignmentDetails(assignment).join(' · ')}</Text>
      </View>
      <Text style={[styles.assignmentStatus, ongoing ? styles.assignmentStatusOngoing : styles.assignmentStatusReturned]}>
        {ongoing ? 'Em andamento' : 'Devolvida'}
      </Text>
    </View>
  );
}

function DateButton({
  label,
  accessibilityLabel,
  onPress,
  value,
}: {
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly value: Date | undefined;
}): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint="Abre o seletor de data"
      onPress={onPress}
      style={({ pressed }) => [styles.dateButton, pressed && styles.pressed]}>
      <Text style={styles.dateLabel}>{label}</Text>
      <Text style={styles.dateValue}>{value === undefined ? 'Selecionar' : formatDate(value)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  assignmentCard: { ...shadows.sm, alignItems: 'flex-start', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 96, padding: spacing.md },
  assignmentContent: { flex: 1, gap: spacing.xs },
  assignmentDates: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  assignmentPublisher: { color: colors.textSecondary, fontSize: 14 },
  assignmentStatus: { borderRadius: radius.full, fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  assignmentStatusOngoing: { backgroundColor: colors.warningSurface, color: colors.warningText },
  assignmentStatusReturned: { backgroundColor: colors.successSurface, color: colors.successText },
  assignmentTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  cards: { gap: spacing.sm },
  clearButton: { alignSelf: 'flex-start', minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.sm },
  clearText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  dateButton: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radius.sm, borderWidth: 1, flex: 1, minHeight: 64, padding: spacing.sm },
  dateLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
  dateRow: { flexDirection: 'row', gap: spacing.sm },
  dateValue: { color: colors.textPrimary, fontSize: 15, fontWeight: '600', marginTop: spacing.xs },
  heading: { gap: spacing.xs },
  periodCard: { ...shadows.sm, backgroundColor: colors.surfaceSubtle, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, gap: spacing.sm, padding: spacing.md },
  periodTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  safeArea: { backgroundColor: colors.background, flex: 1 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: '800' },
});
