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
import { colors, radius, shadows, spacing } from '../theme';

/**
 * The server already answers an invalid, expired and already-redeemed code
 * with the same generic response (see the root CLAUDE.md, "Cadastro de
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
          <View style={styles.card}>
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
              placeholderTextColor={colors.textMuted}
              editable={!busy}
              value={accessCode}
              onChangeText={setAccessCode}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {errorMessage !== null ? <Text style={styles.error}>{errorMessage}</Text> : null}
            <View style={styles.buttonHolder}>
              <PrimaryButton
                title="Confirmar"
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.md,
  },
  logo: {
    width: 140,
    height: 160,
    alignSelf: 'center',
    marginBottom: spacing.xs,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.surfaceSubtle,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 22,
    letterSpacing: 4,
    color: colors.textPrimary,
    textAlign: 'center',
    fontWeight: '700',
  },
  inputFocused: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    fontSize: 13,
  },
  buttonHolder: {
    marginTop: spacing.lg,
  },
});
