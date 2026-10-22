import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Publisher } from '../../domain/models';
import { Button, QuerySearchField } from '../components';
import { colors, radius, spacing, touchTarget } from '../theme';

const NO_MATCH_MESSAGE = 'Nenhum publicador encontrado.';

/**
 * How many options show before "Mostrar todos". The whole congregation used to
 * be listed, which pushed "Designar publicador" and "Marcar como trabalhada"
 * several screens down; the search narrows the rest.
 */
export const PUBLISHER_PICKER_LIMIT = 8;

export interface PublisherPickerProps {
  readonly publishers: readonly Publisher[];
  readonly selectedPublisherId: string | null;
  readonly onSelect: (publisherId: string) => void;
  readonly optionTestIdPrefix: string;
}

export function PublisherPicker({
  publishers,
  selectedPublisherId,
  onSelect,
  optionTestIdPrefix,
}: PublisherPickerProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchingPublishers = useMemo(
    () =>
      publishers.filter(publisher =>
        publisher.name.toLocaleLowerCase().includes(normalizedSearch),
      ),
    [normalizedSearch, publishers],
  );
  const selectedPublisher = publishers.find(publisher => publisher.id === selectedPublisherId);
  // The chosen name always stays in view, first, whatever the search says.
  const others = matchingPublishers.filter(publisher => publisher !== selectedPublisher);
  const shownOthers = showAll ? others : others.slice(0, PUBLISHER_PICKER_LIMIT);
  const visiblePublishers =
    selectedPublisher !== undefined ? [selectedPublisher, ...shownOthers] : shownOthers;
  const hiddenCount = others.length - shownOthers.length;

  return (
    <View>
      <QuerySearchField
        accessibilityLabel="Buscar publicador"
        placeholder="Buscar publicador"
        testID="publisher-search"
        value={search}
        onChangeText={setSearch}
      />
      {matchingPublishers.length === 0 && <Text style={styles.noMatch}>{NO_MATCH_MESSAGE}</Text>}
      <View accessibilityRole="radiogroup" style={styles.options}>
        {visiblePublishers.map(publisher => {
          const checked = selectedPublisherId === publisher.id;
          return (
            <Pressable
              key={publisher.id}
              testID={`${optionTestIdPrefix}${publisher.id}`}
              accessibilityRole="radio"
              accessibilityLabel={publisher.name}
              accessibilityState={{ checked, selected: checked }}
              style={({ pressed }) => [
                styles.option,
                checked && styles.optionSelected,
                pressed && !checked && styles.optionPressed,
              ]}
              onPress={() => onSelect(publisher.id)}>
              <View style={[styles.radio, checked && styles.radioChecked]}>
                {checked && <View style={styles.radioDot} />}
              </View>
              <Text style={styles.optionText}>{publisher.name}</Text>
            </Pressable>
          );
        })}
      </View>
      {hiddenCount > 0 && (
        <Button
          label={`Mostrar todos (${others.length})`}
          variant="quiet"
          onPress={() => setShowAll(true)}
          style={styles.showAll}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  noMatch: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  options: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  option: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: touchTarget.default,
    paddingHorizontal: spacing.md,
  },
  optionPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  optionSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  optionText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 15,
  },
  radio: {
    alignItems: 'center',
    borderColor: colors.borderInput,
    borderRadius: radius.full,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioChecked: {
    borderColor: colors.primary,
  },
  radioDot: {
    backgroundColor: colors.primary,
    borderRadius: radius.full,
    height: 10,
    width: 10,
  },
  showAll: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
});

export default PublisherPicker;
