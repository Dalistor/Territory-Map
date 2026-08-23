// The primary button component with modern look, rounded corners and subtle shadow.
// Keeps accessibilityRole="button" and disabled state compatible with existing tests.
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, shadows, spacing } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'surface';

export interface PrimaryButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  /** Shows a spinner next to the title and blocks presses while a request is in flight. */
  readonly busy?: boolean;
  readonly variant?: ButtonVariant;
  readonly icon?: string;
  readonly style?: StyleProp<ViewStyle>;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  busy,
  variant = 'primary',
  style,
}: PrimaryButtonProps): React.JSX.Element {
  const blocked = disabled === true || busy === true;

  const isOutline = variant === 'outline';
  const isSecondary = variant === 'secondary';
  const isSurface = variant === 'surface';

  const spinnerColor = isOutline || isSurface ? colors.primary : colors.onPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: busy === true }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isSecondary && styles.buttonSecondary,
        isOutline && styles.buttonOutline,
        isSurface && styles.buttonSurface,
        blocked && styles.buttonDisabled,
        pressed && !blocked && (
          isOutline
            ? styles.buttonOutlinePressed
            : isSurface
            ? styles.buttonSurfacePressed
            : styles.buttonPressed
        ),
        style,
      ]}
    >
      {busy === true && <ActivityIndicator color={spinnerColor} size="small" />}
      <Text
        style={[
          styles.title,
          (isOutline || isSurface) && styles.titleOutline,
          isSecondary && styles.titleSecondary,
          blocked && styles.titleDisabled,
        ]}
      >
        {title}
      </Text>
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
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    ...shadows.sm,
  },
  buttonSecondary: {
    backgroundColor: colors.primaryLight,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonSurface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonOutlinePressed: {
    backgroundColor: colors.primaryLight,
  },
  buttonSurfacePressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  buttonDisabled: {
    backgroundColor: colors.disabledSurface,
    borderColor: colors.disabledSurface,
    elevation: 0,
    shadowOpacity: 0,
  },
  title: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  titleOutline: {
    color: colors.primary,
  },
  titleSecondary: {
    color: colors.primary,
  },
  titleDisabled: {
    color: colors.disabledText,
  },
});

export default PrimaryButton;
