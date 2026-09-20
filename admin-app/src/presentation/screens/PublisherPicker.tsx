import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Publisher } from '../../domain/models';

const NO_MATCH_MESSAGE = 'Nenhum publicador encontrado.';

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
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const matchingPublishers = useMemo(
    () =>
      publishers.filter(publisher =>
        publisher.name.toLocaleLowerCase().includes(normalizedSearch),
      ),
    [normalizedSearch, publishers],
  );
  const selectedPublisher = publishers.find(publisher => publisher.id === selectedPublisherId);
  const visiblePublishers =
    selectedPublisher !== undefined && !matchingPublishers.includes(selectedPublisher)
      ? [selectedPublisher, ...matchingPublishers]
      : matchingPublishers;

  return (
    <View>
      <TextInput
        accessibilityLabel="Buscar publicador"
        placeholder="Buscar publicador"
        testID="publisher-search"
        value={search}
        onChangeText={setSearch}
        style={styles.search}
      />
      {matchingPublishers.length === 0 && <Text style={styles.noMatch}>{NO_MATCH_MESSAGE}</Text>}
      {visiblePublishers.map(publisher => (
        <Pressable
          key={publisher.id}
          testID={`${optionTestIdPrefix}${publisher.id}`}
          accessibilityRole="radio"
          accessibilityLabel={publisher.name}
          accessibilityState={{ selected: selectedPublisherId === publisher.id }}
          style={[styles.option, selectedPublisherId === publisher.id && styles.optionSelected]}
          onPress={() => onSelect(publisher.id)}>
          <Text>{publisher.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  noMatch: {
    color: '#64748b',
    fontSize: 13,
    marginTop: 6,
  },
  option: {
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
    padding: 12,
  },
  optionSelected: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1565c0',
  },
  search: {
    borderColor: '#e2e8f0',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
});

export default PublisherPicker;
