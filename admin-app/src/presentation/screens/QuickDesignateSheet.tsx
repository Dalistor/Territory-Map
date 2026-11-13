// Designating straight from the territory list: a bottom sheet with the
// publisher picker and one confirming button. The S-13 card (`AssignmentPanel`)
// still does everything -- history, editing, completing, deleting -- but
// reaching it to hand out a free territory cost a screen change and a scroll,
// and handing out territories is the thing the admin does most in the field.
//
// Only offered for a territory nobody holds, so there is no assignment to
// replace and nothing to confirm: picking a name and pressing the button is
// the whole decision. Replacing a dirigente stays on the card, where the
// warning about closing the current assignment lives.
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Publisher, Territory } from '../../domain/models';
import { Button, QueryState } from '../components';
import { colors, radius, shadows, spacing } from '../theme';
import { PublisherPicker } from './PublisherPicker';

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.';

function errorMessage(thrown: unknown): string {
  return thrown instanceof Error && thrown.message !== '' ? thrown.message : GENERIC_ERROR_MESSAGE;
}

/** Only what the sheet calls -- the real `ApiClient` satisfies it. */
export interface QuickDesignateApi {
  listPublishers(): Promise<Publisher[]>;
  designate(territoryId: string, publisherId: string): Promise<unknown>;
}

export interface QuickDesignateSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface QuickDesignateSheetProps {
  /** The free territory being handed out. */
  readonly territory: Territory;
  readonly session: QuickDesignateSession;
  readonly api: QuickDesignateApi;
  readonly onClose: () => void;
  /** Fired once the designation landed, with the publisher's name for the notice. */
  readonly onDesignated: (publisherName: string) => void;
}

export function QuickDesignateSheet({
  territory,
  session,
  api,
  onClose,
  onDesignated,
}: QuickDesignateSheetProps): React.JSX.Element {
  // `null` until the list arrives: the admin may have registered or
  // deactivated somebody since the last time the sheet was open.
  const [publishers, setPublishers] = useState<Publisher[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    session
      .run(() => api.listPublishers())
      .then(people => {
        if (cancelled) return;
        // Same rule as the S-13 card: a deactivated publisher is not offered.
        setPublishers(people.filter(publisher => publisher.isActive));
        setLoadError(null);
      })
      .catch(thrown => {
        if (!cancelled) setLoadError(errorMessage(thrown));
      });
    return () => {
      cancelled = true;
    };
  }, [api, session, loadAttempt]);

  async function designate(): Promise<void> {
    if (selectedId === null || isSaving) return;
    const publisherName =
      publishers?.find(publisher => publisher.id === selectedId)?.name ?? '';
    setIsSaving(true);
    setSaveError(null);
    try {
      await session.run(() => api.designate(territory.id, selectedId));
    } catch (thrown) {
      setSaveError(errorMessage(thrown));
      setIsSaving(false);
      return;
    }
    onDesignated(publisherName);
  }

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.scrim}>
        <Pressable
          accessibilityLabel="Fechar"
          accessibilityRole="button"
          style={styles.dismissArea}
          onPress={onClose}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text accessibilityRole="header" style={styles.title}>
            Designar {territory.name}
          </Text>
          <Text style={styles.subtitle}>
            Quem recebe o território passa a poder marcar as quadras dele no app.
          </Text>

          {loadError !== null ? (
            <QueryState
              compact
              kind="error"
              title="Não foi possível carregar os publicadores"
              message={loadError}
              onRetry={() => {
                setLoadError(null);
                setLoadAttempt(attempt => attempt + 1);
              }}
            />
          ) : publishers === null ? (
            <QueryState
              compact
              kind="loading"
              title="Carregando publicadores"
              message="Aguarde um momento."
            />
          ) : publishers.length === 0 ? (
            <Text style={styles.empty}>
              Nenhum publicador ativo. O cadastro é feito no admin do computador.
            </Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={styles.picker}>
              <PublisherPicker
                publishers={publishers}
                selectedPublisherId={selectedId}
                onSelect={setSelectedId}
                optionTestIdPrefix="quick-designate-"
              />
            </ScrollView>
          )}

          {saveError !== null && (
            <Text accessible accessibilityRole="alert" style={styles.error}>
              {saveError}
            </Text>
          )}

          <View style={styles.actions}>
            <Button label="Cancelar" variant="quiet" onPress={onClose} style={styles.action} />
            <Button
              label="Designar publicador"
              busyLabel="Designando…"
              variant="primary"
              busy={isSaving}
              disabled={selectedId === null}
              onPress={designate}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    ...shadows.lg,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '85%',
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  grabber: {
    alignSelf: 'center',
    backgroundColor: colors.borderStrong,
    borderRadius: radius.full,
    height: 4,
    marginBottom: spacing.md,
    width: 40,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: spacing.md,
    marginTop: spacing.xs,
  },
  picker: {
    flexGrow: 0,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 14,
    paddingVertical: spacing.md,
  },
  error: {
    color: colors.dangerText,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  action: {
    flex: 1,
  },
});

export default QuickDesignateSheet;
