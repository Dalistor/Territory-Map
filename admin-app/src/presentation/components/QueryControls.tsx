import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius, spacing, touchTarget } from '../theme';
import { Button } from './Button';

const MINIMUM_TOUCH_TARGET = touchTarget.default;

export interface QuerySearchFieldProps {
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder: string;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/** A search input whose clear action keeps the keyboard ready for the next query. */
export function QuerySearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  testID,
}: QuerySearchFieldProps): React.JSX.Element {
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  const clear = () => {
    onChangeText('');
    input.current?.focus();
  };

  return (
    <View style={styles.searchField}>
      <TextInput
        ref={input}
        accessibilityLabel={accessibilityLabel}
        placeholder={placeholder}
        placeholderTextColor={colors.textPlaceholder}
        value={value}
        onChangeText={onChangeText}
        style={styles.searchInput}
        testID={testID}
      />
      {value !== '' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Limpar busca"
          accessibilityHint="Remove o texto da busca"
          hitSlop={spacing.sm}
          onPress={clear}
          style={({ pressed }) => [
            styles.clearButton,
            pressed && styles.pressed,
          ]}>
          <Text style={styles.clearText}>Limpar</Text>
        </Pressable>
      )}
    </View>
  );
}

export interface QuerySegment {
  readonly value: string;
  readonly label: string;
}

export interface QuerySegmentedControlProps {
  readonly segments: readonly QuerySegment[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly accessibilityLabel: string;
}

/** Compact two-or-three way switch used for visible list/map or detail modes. */
export function QuerySegmentedControl({
  segments,
  value,
  onChange,
  accessibilityLabel,
}: QuerySegmentedControlProps): React.JSX.Element {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} style={styles.segmentedControl}>
      {segments.map(segment => {
        const selected = segment.value === value;
        return (
          <Pressable
            key={segment.value}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            onPress={() => onChange(segment.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && styles.pressed,
            ]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface QueryListItemProps {
  readonly title: string;
  readonly description?: string;
  readonly details?: readonly string[];
  readonly status?: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/** A dense, tappable record for consultation lists. It deliberately owns no data fetching. */
export function QueryListItem({
  title,
  description,
  details = [],
  status,
  onPress,
  accessibilityLabel,
  testID,
}: QueryListItemProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint="Abre os detalhes"
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.listItem, pressed && styles.pressed]}>
      <View style={styles.listItemMain}>
        <Text style={styles.listItemTitle}>
          {title}
        </Text>
        {description !== undefined && (
          <Text style={styles.listItemDescription}>
            {description}
          </Text>
        )}
        {details.length > 0 && (
          <Text style={styles.listItemDetails}>
            {details.join(' · ')}
          </Text>
        )}
      </View>
      <View style={styles.listItemAside}>
        {status !== undefined && <Text style={styles.statusPill}>{status}</Text>}
        <Text accessibilityElementsHidden style={styles.disclosure}>
          ›
        </Text>
      </View>
    </Pressable>
  );
}

export type QueryStateKind = 'loading' | 'empty' | 'no-results' | 'error';

export interface QueryStateProps {
  readonly kind: QueryStateKind;
  readonly title: string;
  readonly message: string;
  readonly onRetry?: () => void;
  /** For `no-results`: undoes the search or filter that emptied the list. */
  readonly onClear?: () => void;
  /** What `onClear` undoes; "Limpar busca" unless the caller says otherwise. */
  readonly clearLabel?: string;
  /** A shorter block for overlays (over the map) where 164 dp would hide too much. */
  readonly compact?: boolean;
}

/** Stable-height feedback for a query area, so a refresh does not jump surrounding content. */
export function QueryState({
  kind,
  title,
  message,
  onRetry,
  onClear,
  clearLabel = 'Limpar busca',
  compact = false,
}: QueryStateProps): React.JSX.Element {
  const isLoading = kind === 'loading';

  // The text is one accessible group and the action its sibling: a button
  // nested inside an `accessible` view cannot be reached by TalkBack.
  return (
    <View
      style={[
        styles.queryState,
        compact && styles.queryStateCompact,
        kind === 'error' && styles.queryStateError,
      ]}>
      <View
        accessible
        accessibilityRole={kind === 'error' ? 'alert' : undefined}
        accessibilityLabel={`${title}. ${message}`}
        accessibilityLiveRegion="polite"
        style={styles.queryStateText}>
        {isLoading && <ActivityIndicator accessibilityLabel="Carregando" color={colors.primary} />}
        <Text style={styles.queryStateTitle}>{title}</Text>
        <Text style={styles.queryStateMessage}>{message}</Text>
      </View>
      {kind === 'error' && onRetry !== undefined && (
        <Button label="Tentar novamente" onPress={onRetry} style={styles.queryStateAction} />
      )}
      {kind === 'no-results' && onClear !== undefined && (
        <Button label={clearLabel} variant="quiet" onPress={onClear} style={styles.queryStateAction} />
      )}
    </View>
  );
}

export interface QueryPaginationProps {
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly onPageChange: (page: number) => void;
  readonly isBusy?: boolean;
}

function resultRange(page: number, pageSize: number, total: number): string {
  if (total === 0) return '0 resultados';
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return `${first}–${last} de ${total}`;
}

/** Server-side pagination controls; the range says what the current page contains. */
export function QueryPagination({
  page,
  pageSize,
  total,
  onPageChange,
  isBusy = false,
}: QueryPaginationProps): React.JSX.Element {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const canGoBack = !isBusy && page > 1;
  const canGoForward = !isBusy && page < lastPage;

  return (
    <View accessibilityLabel={`Paginação, ${resultRange(page, pageSize, total)}`} style={styles.pagination}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Página anterior"
        accessibilityState={{ disabled: !canGoBack }}
        disabled={!canGoBack}
        onPress={() => onPageChange(page - 1)}
        style={({ pressed }) => [
          styles.paginationButton,
          !canGoBack && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.paginationText, !canGoBack && styles.buttonTextDisabled]}>Anterior</Text>
      </Pressable>
      <View style={styles.paginationRange}>
        <Text style={styles.paginationRangeText}>{resultRange(page, pageSize, total)}</Text>
        <Text style={styles.paginationPageText}>Página {page} de {lastPage}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Próxima página"
        accessibilityState={{ disabled: !canGoForward }}
        disabled={!canGoForward}
        onPress={() => onPageChange(page + 1)}
        style={({ pressed }) => [
          styles.paginationButton,
          !canGoForward && styles.buttonDisabled,
          pressed && styles.pressed,
        ]}>
        <Text style={[styles.paginationText, !canGoForward && styles.buttonTextDisabled]}>Próxima</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  buttonDisabled: { backgroundColor: colors.disabledSurface, borderColor: colors.disabledSurface },
  buttonTextDisabled: { color: colors.disabledText },
  clearButton: { alignItems: 'center', justifyContent: 'center', minHeight: MINIMUM_TOUCH_TARGET, paddingHorizontal: spacing.sm },
  clearText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  disclosure: { color: colors.textMuted, fontSize: 28, lineHeight: 32 },
  listItem: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 80, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  listItemAside: { alignItems: 'flex-end', gap: spacing.xs, marginLeft: spacing.sm },
  listItemDescription: { color: colors.textSecondary, fontSize: 14, marginTop: spacing.xs },
  listItemDetails: { color: colors.textSecondary, fontSize: 13, marginTop: spacing.xs },
  listItemMain: { flex: 1, minWidth: 0 },
  listItemTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700' },
  pagination: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between', paddingVertical: spacing.sm },
  paginationButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.borderInput, borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: MINIMUM_TOUCH_TARGET, minWidth: 88, paddingHorizontal: spacing.sm },
  paginationPageText: { color: colors.textSecondary, fontSize: 12, marginTop: spacing.xs },
  paginationRange: { alignItems: 'center', flex: 1 },
  paginationRangeText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  paginationText: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  queryState: { alignItems: 'center', backgroundColor: colors.surfaceSubtle, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 164, padding: spacing.lg },
  queryStateCompact: { minHeight: 0, padding: spacing.md },
  queryStateError: { backgroundColor: colors.dangerSurface, borderColor: colors.dangerBorder },
  queryStateAction: { marginTop: spacing.md },
  queryStateMessage: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: spacing.xs, textAlign: 'center' },
  queryStateText: { alignItems: 'center' },
  queryStateTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: spacing.sm, textAlign: 'center' },
  searchField: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.borderInput, borderRadius: radius.sm, borderWidth: 1, flexDirection: 'row', minHeight: MINIMUM_TOUCH_TARGET },
  searchInput: { color: colors.textPrimary, flex: 1, fontSize: 16, minHeight: MINIMUM_TOUCH_TARGET, paddingHorizontal: spacing.md, paddingVertical: 0 },
  segment: { alignItems: 'center', borderColor: 'transparent', borderRadius: radius.sm, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: MINIMUM_TOUCH_TARGET, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  segmentedControl: { backgroundColor: colors.surfaceSubtle, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, padding: spacing.xs },
  segmentSelected: { backgroundColor: colors.primaryLight, borderColor: colors.primary, borderWidth: 1 },
  segmentText: { color: colors.textSecondary, fontSize: 14, fontWeight: '700', textAlign: 'center' },
  segmentTextSelected: { color: colors.primaryPressed },
  statusPill: { backgroundColor: colors.primaryLight, borderRadius: radius.full, color: colors.primaryPressed, fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
});
