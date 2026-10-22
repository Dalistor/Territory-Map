// The first screen the publisher ever sees. There is no login: the admin
// hands out a one-time access code, and this screen's only job is to trade
// it for the permanent app token (`ApiClient.activate`, `data/api-client.ts`,
// spec 0005 Task 18) and persist the resulting session
// (`saveSession`, `data/session-store.ts`, Task 19). Navigation itself is not
// wired here -- `onActivated` is a prop so this component renders and tests
// without a real `NavigationContainer`; Task 26 supplies the real callback.
import { useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import logo from '../assets/logo.png';
import { createApiClient } from '../../data/api-client';
import { saveSession } from '../../data/session-store';
import type { Session } from '../../domain/models';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, fontSize, radius, spacing } from '../theme';

/** Codes are always 8 characters long (`ACCESS_CODE_ALPHABET`, server `app/core/security.py`). */
const ACCESS_CODE_LENGTH = 8;

/**
 * The server already answers an invalid, expired and already-redeemed code
 * with the same generic response (see the root AGENTS.md, "Cadastro de
 * publicador" -- distinguishing them here would invent a difference the
 * server deliberately does not expose) so this is the one message shown for
 * every rejection, regardless of what `activate` actually threw.
 */
const GENERIC_ERROR_MESSAGE =
  'Código inválido, expirado ou já usado. Confira com quem cuida dos territórios na congregação.';

export interface ActivationScreenProps {
  /** Called with the freshly activated session once it has already been persisted. */
  onActivated: (session: Session) => void;
}

export default function ActivationScreen({ onActivated }: ActivationScreenProps): React.JSX.Element {
  const [apiClient] = useState(() => createApiClient());
  const [accessCode, setAccessCode] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const trimmedCode = accessCode.trim();

  async function handleConfirm(): Promise<void> {
    if (trimmedCode === '' || busy) return;
    setErrorMessage(null);
    setBusy(true);
    try {
      const session = await apiClient.activate(trimmedCode);
      await saveSession(session);
      onActivated(session);
    } catch {
      setErrorMessage(GENERIC_ERROR_MESSAGE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.content}>
            <Image
              source={logo}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Territory Map"
            />
            <Text style={styles.title}>Territory Map</Text>
            <Text style={styles.subtitle}>
              Digite o código de acesso que você recebeu de quem cuida dos territórios na congregação.
            </Text>
            <Text style={styles.label}>Código de acesso</Text>
            <TextInput
              style={[styles.input, isFocused && styles.inputFocused]}
              accessibilityLabel="Código de acesso"
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="ABCDEFGH"
              placeholderTextColor={colors.textPlaceholder}
              maxLength={ACCESS_CODE_LENGTH}
              autoFocus
              returnKeyType="go"
              onSubmitEditing={handleConfirm}
              editable={!busy}
              value={accessCode}
              onChangeText={setAccessCode}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {errorMessage !== null ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}
            <View style={styles.buttonHolder}>
              <PrimaryButton
                title="Ativar acesso"
                onPress={handleConfirm}
                disabled={trimmedCode === ''}
                busy={busy}
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  // No card: the screen holds one field, and DESIGN.md keeps resting
  // surfaces flat -- logo, title, field and button sit on the canvas.
  content: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
  logo: {
    width: 96,
    height: 96,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: fontSize.body,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderInput,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 22,
    letterSpacing: 4,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
  },
  inputFocused: {
    borderColor: colors.focus,
  },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.sm,
    padding: spacing.md,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    fontSize: 14,
  },
  buttonHolder: {
    marginTop: spacing.lg,
  },
});
