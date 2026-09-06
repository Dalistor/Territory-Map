// The one screen where the admin types a credential, and only on the very
// first launch. From here on `data/session.ts` signs in on its own with what
// the Android keystore holds.
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import logo from '../assets/logo.png';
import type { Congregation } from '../../domain/models';
// The error *class*, not the HTTP client: telling "the server said no" apart
// from "the server never answered" is the difference between blaming the
// admin's password and blaming the connection, and only the rejection itself
// carries that. Nothing here ever calls `fetch` -- `session.configure` does.
import { ApiError } from '../../data/api-client';
import type { Session } from '../../data/session';
import { colors, radius, shadows, spacing } from '../theme';

/**
 * The server answers a wrong name, a wrong city and a wrong password with the
 * same deliberately vague "credenciais inválidas" (see "Login (admin)" in the
 * root AGENTS.md), so repeating it would leave the admin guessing which of the
 * three to fix. This says what to do instead.
 */
const CREDENTIALS_REJECTED_MESSAGE =
  'Nome, cidade ou senha não conferem. Confira os três e tente de novo.';
const GENERIC_ERROR_MESSAGE = 'Não foi possível configurar a congregação. Tente de novo.';

/** Reduces whatever `configure` rejected with to something worth showing. */
function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    return error.isUnauthorized ? CREDENTIALS_REJECTED_MESSAGE : error.message;
  }
  // A `NetworkError` lands here, and its own message already says the server
  // could not be reached -- which is exactly what the admin needs to read, and
  // never the same text as a refused credential.
  if (error instanceof Error && error.message !== '') return error.message;
  return GENERIC_ERROR_MESSAGE;
}

export interface SetupScreenProps {
  /** Only `configure` is used; the whole session is taken so the caller may pass it as is. */
  readonly session: Pick<Session, 'configure'>;
  /** Called once the credentials were accepted and saved on this device. */
  readonly onConfigured: (congregation: Congregation) => void;
  /**
   * Why the admin is looking at this screen when he did not ask to -- signed
   * out by the server, or a credential that stopped working. Set by `App.tsx`;
   * absent on the ordinary first launch, which needs no explanation.
   */
  readonly reason?: string;
}

export default function SetupScreen({
  session,
  onConfigured,
  reason,
}: SetupScreenProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const inFlight = useRef(false);

  // The trim/no-trim split is the same one `handleConfirm` sends to the
  // server, and for the same reason: a name of only spaces is an empty name,
  // while a password of only spaces is a password.
  const incomplete = name.trim() === '' || city.trim() === '' || password === '';
  // A login already in flight blocks the button for the same reason an empty
  // field does: a second press would start a second login.
  const blocked = incomplete || busy;

  async function handleConfirm(): Promise<void> {
    // The `busy` state disables the button, but a state update is not
    // instantaneous: two taps can reach this handler before React re-renders,
    // and the second one would still be holding the closure where `busy` is
    // false. The ref closes that window -- it is written before the first
    // `await`, so nothing can slip between the check and the flag.
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setErrorMessage(null);
    try {
      // Same split the desktop screen makes: `name`/`city` are trimmed because
      // leading and trailing whitespace is never meaningful in either, and the
      // password goes exactly as typed -- trimming a secret would silently
      // authenticate against something other than what the admin typed, and
      // the server does not trim it either.
      const congregation: Congregation = await session.configure({
        name: name.trim(),
        city: city.trim(),
        password,
      });
      // Navigation is not decided here -- the caller (App.tsx, Task 08) is
      // what knows where a configured app goes next, the same split of
      // responsibility the desktop screen has.
      onConfigured(congregation);
    } catch (error) {
      // The typed values stay in state on purpose: usually only one of the
      // three is wrong, and clearing the form would make the admin type the
      // other two again.
      setErrorMessage(messageFor(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* No `behavior` prop: this app ships for Android only (there is no
          `ios/` folder), and on Android the default resize behaviour is what
          the keyboard already does. */}
      <KeyboardAvoidingView style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* Same logo the publisher's app shows on its first screen: the
                two are one product, and the admin should recognise it before
                reading a word. `contain` because the image is taller than it
                is wide -- stretching it to a square would distort it. */}
            <Image
              source={logo}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Territory Map"
            />
            <Text style={styles.title}>Territory Map Admin</Text>
            <Text style={styles.subtitle}>
              Informe os dados da congregação para este aparelho entrar sozinho a partir de agora.
            </Text>

            {reason !== undefined && reason !== '' ? (
              // `alert` so a screen reader announces it: this text is the only
              // thing explaining why the app went back to asking for a
              // password nobody expected to type again.
              <Text accessibilityRole="alert" style={styles.reason}>
                {reason}
              </Text>
            ) : null}

            <Text style={styles.label}>Nome da congregação</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Nome da congregação"
              autoCapitalize="words"
              autoCorrect={false}
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Cidade</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Cidade"
              autoCapitalize="words"
              autoCorrect={false}
              value={city}
              onChangeText={setCity}
            />

            <Text style={styles.label}>Senha</Text>
            <TextInput
              style={styles.input}
              accessibilityLabel="Senha"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {errorMessage !== null ? (
              // `alert` is what makes a screen reader announce the failure the
              // moment it appears, instead of leaving it to be discovered by
              // someone swiping back up the form.
              <Text accessibilityRole="alert" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Confirmar"
              accessibilityState={{ disabled: blocked, busy }}
              disabled={blocked}
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.button,
                blocked && styles.buttonDisabled,
                pressed && !blocked && styles.buttonPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator
                  accessibilityLabel="Entrando"
                  color={colors.onPrimary}
                  size="small"
                />
              ) : null}
              <Text style={[styles.buttonTitle, blocked && styles.buttonTitleDisabled]}>
                Confirmar
              </Text>
            </Pressable>

            {/* The one line that answers "where does my password go?" before
                the admin types it -- the same promise the desktop screen makes,
                with "computador" swapped for the phone in hand. */}
            <Text style={styles.footer}>
              Os dados ficam guardados só neste aparelho e o app não vai pedir login de novo.
            </Text>
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
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  reason: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.warningText,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.md,
    padding: spacing.md,
  },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    padding: spacing.md,
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    ...shadows.sm,
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonDisabled: {
    backgroundColor: colors.disabledSurface,
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonTitle: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonTitleDisabled: {
    color: colors.disabledText,
  },
  footer: {
    marginTop: spacing.md,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
