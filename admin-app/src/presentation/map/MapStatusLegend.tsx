import { StyleSheet, Text, View } from 'react-native';
import { BLOCK_CATEGORY_COLOR } from '../../domain/territoryMap';
import { colors, radius, spacing } from '../theme';

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
    backgroundColor: colors.mapOverlay,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    // Keep the OSM attribution in its own bottom strip; map controls remain
    // in the native top corners and are therefore unaffected as well.
    bottom: spacing.xl + spacing.sm,
    columnGap: spacing.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    left: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    position: 'absolute',
    right: spacing.sm,
    zIndex: 2,
  },
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  label: { color: colors.mapLabelInk, fontSize: 11 },
  swatch: {
    borderColor: colors.surface,
    borderRadius: radius.xs,
    borderWidth: 1,
    height: 10,
    width: 10,
  },
});
