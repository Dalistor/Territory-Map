// The two asynchronous states a list section shows before (or instead of) its
// rows, per DESIGN.md / UX-CONTRACT.md: loading keeps the final geometry with
// flat grey bars at row height (no shimmer, no false "nothing here"), and an
// error stays inside the section that failed, says what failed and offers
// "Tentar novamente".
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, radius, spacing, touchTarget } from '../theme';

/** Placeholder rows at the real row pitch, announced as loading to screen readers. */
export function LoadingRows({
  count = 2,
  label,
}: {
  readonly count?: number;
  /** What is loading, e.g. "Carregando territórios designados". */
  readonly label: string;
}): React.JSX.Element {
  return (
    <View accessible accessibilityLabel={label} accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, index) => (
        <View key={index} style={[styles.row, index > 0 && styles.rowDivided]}>
          <View style={styles.lines}>
            <View style={[styles.bar, styles.barTitle]} />
            <View style={[styles.bar, styles.barSubtitle]} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** One sentence about the failure and the retry, inside the block that failed. */
export function SectionError({
  message,
  onRetry,
}: {
  readonly message: string;
  readonly onRetry: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.error}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.errorText}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.retry, pressed && styles.retryPressed]}
      >
        <Text style={styles.retryText}>Tentar novamente</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 64,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  rowDivided: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  lines: {
    gap: spacing.sm,
  },
  bar: {
    backgroundColor: colors.border,
    borderRadius: radius.xs,
  },
  barTitle: {
    height: 16,
    width: '55%',
  },
  barSubtitle: {
    height: 12,
    width: '35%',
  },
  error: {
    paddingVertical: spacing.md,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  retry: {
    minHeight: touchTarget.min,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  retryPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  retryText: {
    color: colors.primary,
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
