// The one filled-button look the app uses, so "a button" is styled in a
// single place. Keeps `accessibilityRole="button"` and the `disabled` state
// exactly as the bare `Pressable`s it replaces exposed them -- the screen
// tests query by that role and by the title text.
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, spacing } from '../theme';

export interface PrimaryButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  /** Shows a spinner next to the title and blocks presses while a request is in flight. */
  readonly busy?: boolean;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  busy,
}: PrimaryButtonProps): React.JSX.Element {
  const blocked = disabled === true || busy === true;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: busy === true }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        blocked && styles.buttonDisabled,
        pressed && !blocked && styles.buttonPressed,
      ]}
    >
      {busy === true && <ActivityIndicator color={colors.onPrimary} size="small" />}
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
  },
  buttonPressed: { backgroundColor: colors.primaryPressed },
  buttonDisabled: { backgroundColor: colors.disabledSurface },
  title: { color: colors.onPrimary, fontSize: 16, fontWeight: '600' },
});

export default PrimaryButton;
