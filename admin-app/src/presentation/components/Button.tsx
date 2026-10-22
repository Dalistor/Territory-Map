import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, touchTarget } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'quiet';

export interface ButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  /** Keeps the button's size while the action runs, and announces it. */
  readonly busy?: boolean;
  /** Shown instead of `label` while busy ("Salvando…"). */
  readonly busyLabel?: string;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly testID?: string;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * The app's one button: 48 dp tall at minimum, a visible disabled state and
 * the state announced to TalkBack. Primary is the screen's one commitment;
 * secondary is surface and border; danger names a destructive consequence;
 * quiet is a text action that does not compete with the content.
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  busy = false,
  busyLabel,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps): React.JSX.Element {
  const inactive = disabled || busy;
  const text = busy && busyLabel !== undefined ? busyLabel : label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        containerStyles[variant],
        inactive && variant !== 'quiet' && styles.disabled,
        pressed && !inactive && pressedStyles[variant],
        style,
      ]}
    >
      {busy && (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? colors.onPrimary : colors.primary}
        />
      )}
      <Text
        style={[
          styles.label,
          labelStyles[variant],
          inactive && styles.labelDisabled,
        ]}
      >
        {text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: touchTarget.default,
    minWidth: touchTarget.default,
    paddingHorizontal: spacing.md,
  },
  disabled: {
    backgroundColor: colors.disabledSurface,
    borderColor: colors.disabledSurface,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelDisabled: {
    color: colors.disabledText,
  },
});

const containerStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primary, borderColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.borderInput },
  danger: { backgroundColor: colors.surface, borderColor: colors.dangerText },
  quiet: { backgroundColor: 'transparent', borderColor: 'transparent', paddingHorizontal: spacing.sm },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed, borderColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.surfaceSubtle },
  danger: { backgroundColor: colors.dangerSurface },
  quiet: { backgroundColor: colors.primaryLight },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onPrimary },
  secondary: { color: colors.textPrimary },
  danger: { color: colors.dangerText },
  quiet: { color: colors.primary },
});

export default Button;
