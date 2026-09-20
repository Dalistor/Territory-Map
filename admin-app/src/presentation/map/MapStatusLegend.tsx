import { StyleSheet, Text, View } from 'react-native';
import { BLOCK_CATEGORY_COLOR } from '../../domain/territoryMap';

const STATUS_ITEMS = [
  { label: 'Nunca trabalhada', color: BLOCK_CATEGORY_COLOR.never },
  { label: 'Vencida', color: BLOCK_CATEGORY_COLOR.overdue },
  { label: 'Em dia', color: BLOCK_CATEGORY_COLOR.recent },
] as const;

/** Explains the block colours without covering map controls or attribution. */
export function MapStatusLegend(): React.JSX.Element {
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel="Legenda de status das quadras: Nunca trabalhada, Vencida, Em dia"
      pointerEvents="none"
      style={styles.container}
    >
      {STATUS_ITEMS.map(item => (
        <View key={item.label} style={styles.item}>
          <View
            accessible={false}
            style={[styles.swatch, { backgroundColor: item.color }]}
          />
          <Text style={styles.label}>{item.label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 6,
    // Keep the OSM attribution in its own bottom strip; map controls remain
    // in the native top corners and are therefore unaffected as well.
    bottom: 40,
    flexDirection: 'row',
    flexWrap: 'wrap',
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: 'absolute',
    right: 8,
    zIndex: 2,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    marginRight: 10,
    marginVertical: 1,
  },
  label: { color: '#263238', fontSize: 10 },
  swatch: {
    borderColor: '#ffffff',
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    marginRight: 4,
    width: 10,
  },
});
