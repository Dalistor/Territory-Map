// The first screen the publisher ever sees. There is no login: the admin
// hands out a one-time access code, and this screen's only job is to trade
// it for the permanent app token (`ApiClient.activate`, `data/api-client.ts`,
// spec 0005 Task 18) and persist the resulting session
// (`saveSession`, `data/session-store.ts`, Task 19). Navigation itself is not
// wired here -- `onActivated` is a prop so this component renders and tests
// without a real `NavigationContainer`; Task 26 supplies the real callback.
//
// This screen has `headerShown: false` (App.tsx), so it is the one screen
// that must handle the status-bar inset itself -- hence the
// `react-native-safe-area-context` SafeAreaView (the native-stack header
// covers that job on every other screen).
import { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import logo from '../assets/logo.png';
import { createApiClient } from '../../data/api-client';
import { saveSession } from '../../data/session-store';
import type { Session } from '../../domain/models';
import { PrimaryButton } from '../components/PrimaryButton';
import { colors, spacing } from '../theme';

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
      <View style={styles.content}>
        <Image
          source={logo}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Territory Map"
        />
        <Text style={styles.subtitle}>
          Digite o código de acesso que você recebeu de quem cuida dos territórios na congregação.
        </Text>
        <Text style={styles.label}>Código de acesso</Text>
        <TextInput
          style={styles.input}
          accessibilityLabel="Código de acesso"
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="ABCDEFGH"
          placeholderTextColor={colors.textSecondary}
          editable={!busy}
          value={accessCode}
          onChangeText={setAccessCode}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg },
  logo: {
    // The source PNG is 640x749 (pin + wordmark); the image's own light-gray
    // background (#f5f5f5) sits close enough to colors.background (#f5f7fa)
    // to blend without any treatment.
    width: 180,
    height: 210,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 20,
    letterSpacing: 4,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  error: {
    marginTop: spacing.md,
    color: colors.danger,
    backgroundColor: colors.dangerSurface,
    borderRadius: 8,
    padding: spacing.md,
    lineHeight: 20,
  },
  buttonHolder: { marginTop: spacing.lg },
});
