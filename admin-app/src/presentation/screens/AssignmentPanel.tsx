// The S-13 card on a phone (spec 0012, Task 11): who has this territory now,
// who had it before, and the three things the admin can do about it.
//
// Mirrors the history panel inside
// `admin/src/renderer/screens/DesignationsScreen.tsx`, including the wording
// of every confirmation -- those texts say the *consequence* ("será encerrada
// com a data de hoje", "perde na hora o acesso", "não há como desfazer"), not
// just the action, because that is the part the admin cannot get back.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  assignmentIsOpen,
  openAssignment as findOpenAssignment,
  sortAssignments,
} from '../../domain/assignment';
import type { Assignment, Publisher, Territory } from '../../domain/models';
import { colors, radius, spacing } from '../theme';
import { PublisherPicker } from './PublisherPicker';

/** Only the API surface this panel needs -- the real `ApiClient` satisfies it. */
export interface AssignmentPanelApi {
  listAssignments(territoryId: string): Promise<Assignment[]>;
  listPublishers(): Promise<Publisher[]>;
  designate(territoryId: string, publisherId: string): Promise<unknown>;
  completeAssignment(territoryId: string): Promise<unknown>;
  deleteAssignment(territoryId: string, assignmentId: string): Promise<void>;
}

/** Only `run` -- the panel never signs in, signs out or reads the token. */
export interface AssignmentPanelSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface AssignmentPanelProps {
  readonly territory: Territory;
  readonly session: AssignmentPanelSession;
  readonly api: AssignmentPanelApi;
  /**
   * Fired after every write that lands. `Territory.assignedPublisher` is a
   * projection of the open assignment on the server, so designating,
   * completing or deleting moves the list behind this panel too -- the screen
   * that opened it reloads on this signal instead of going stale.
   */
  readonly onChanged?: () => void;
  /**
   * Whether the panel brings its own scroll. On its own it does; embedded in
   * the block panel (spec 0013) it must not, because a vertical scroll inside
   * another one steals the gesture and the admin cannot reach the bottom of
   * either.
   */
  readonly scrollable?: boolean;
}

const GENERIC_ERROR_MESSAGE = 'Não foi possível completar a operação.';

/**
 * The message the server (or the network layer) already wrote, when there is
 * one -- `ApiError` and `NetworkError` both carry text meant for this admin.
 * Anything else falls back rather than printing a stringified object.
 */
function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return GENERIC_ERROR_MESSAGE;
}

/** The one place a date becomes text on this panel. */
function formatDate(date: Date): string {
  return date.toLocaleDateString();
}

// The three confirmation texts, word for word from the desktop panel. Each one
// spells out what the admin cannot take back: the current assignment closing
// today, the publisher losing the right to mark blocks, the row leaving the
// history for good.

function replaceConfirmMessage(
  territoryName: string,
  currentName: string,
  nextName: string,
): string {
  return (
    `Designar "${territoryName}" a ${nextName}?\n\n` +
    `A designação atual, de ${currentName}, será encerrada com a data de hoje.`
  );
}

function completeConfirmMessage(
  territoryName: string,
  leaderName: string,
): string {
  return (
    `Marcar a designação de ${leaderName} em "${territoryName}" como concluída?\n\n` +
    'O território fica livre para outro publicador, e ' +
    `${leaderName} perde na hora o acesso para marcar quadras nele.`
  );
}

function deleteConfirmMessage(publisherName: string): string {
  return (
    `Apagar a designação de ${publisherName}?\n\n` +
    'O registro sai do histórico como se não tivesse existido. Não há como desfazer.'
  );
}

/**
 * `assignmentIsOpen`'s complement, narrowed: an assignment is open exactly
 * while it has no `completedAt`, so everything that is *not* open provably has
 * one. Same helper the desktop panel carries, for the same reason.
 */
function assignmentIsCompleted(
  assignment: Assignment,
): assignment is Assignment & { readonly completedAt: Date } {
  return !assignmentIsOpen(assignment);
}

export function AssignmentPanel({
  territory,
  session,
  api,
  onChanged,
  scrollable = true,
}: AssignmentPanelProps): React.JSX.Element {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(
    null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const writeInFlight = useRef(false);

  /** Re-reads just this territory's card -- what every write invalidates. */
  const reloadAssignments = useCallback(async () => {
    setAssignments(await session.run(() => api.listAssignments(territory.id)));
  }, [api, session, territory.id]);

  /**
   * The card plus the options to designate to. Deactivated publishers are
   * filtered out here: deactivating revokes app access, and offering someone
   * who cannot open the app would be offering a designation that does nothing.
   */
  const load = useCallback(async () => {
    await Promise.all([
      reloadAssignments(),
      session
        .run(() => api.listPublishers())
        .then(people =>
          setPublishers(people.filter(publisher => publisher.isActive)),
        ),
    ]);
  }, [api, reloadAssignments, session]);

  useEffect(() => {
    let cancelled = false;
    load()
      .catch((error: unknown) => {
        // A card that failed to load must not read as "nobody is assigned
        // here" -- that is a different fact, and the admin would act on it.
        if (!cancelled) {
          setLoadError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const open = findOpenAssignment(assignments);
  // Sorted newest-first by the domain rule, then narrowed to the completed
  // lines: the open one already has its own section above, and saying "not
  // open" in the type is what keeps the row free of an impossible "and if
  // there is no completion date?" branch.
  const history = sortAssignments(assignments).filter(assignmentIsCompleted);

  /**
   * Turns a rejected write into a message the admin can read, never into an
   * unhandled rejection and never into the panel disappearing: whatever failed,
   * the card is still the right thing to be looking at, and the selection the
   * admin made is still there to retry with.
   */
  const runGuarded = useCallback((action: () => Promise<void>): void => {
    setActionError(null);
    action().catch((error: unknown) => setActionError(errorMessage(error)));
  }, []);

  /**
   * Ask first, run only on "yes". `Alert` is the phone's equivalent of the
   * desktop's `window.confirm`, and the message is the whole point of it.
   */
  const confirmThen = useCallback(
    (
      title: string,
      message: string,
      confirmLabel: string,
      action: () => Promise<void>,
    ) => {
      Alert.alert(title, message, [
        { text: 'Cancelar', style: 'cancel' },
        { text: confirmLabel, onPress: () => runGuarded(action) },
      ]);
    },
    [runGuarded],
  );

  /**
   * The shape all three writes share: do it under the session (which renews a
   * stale token on its own), re-read the card, and tell whoever opened the
   * panel -- the territory list behind it shows the assigned publisher, and
   * that is a projection of what just changed.
   */
  const writeThenRefresh = useCallback(
    async (write: () => Promise<unknown>): Promise<void> => {
      if (writeInFlight.current) return;
      writeInFlight.current = true;
      setIsWriting(true);
      try {
        await session.run(write);
        await reloadAssignments();
        onChanged?.();
      } finally {
        writeInFlight.current = false;
        setIsWriting(false);
      }
    },
    [onChanged, reloadAssignments, session],
  );

  /**
   * Only *replacing* somebody is destructive enough to ask about: it closes
   * the assignment in force with today's date, which the admin has to know
   * before it happens. Designating a free territory takes nothing away.
   */
  const requestDesignate = useCallback(() => {
    if (selectedPublisherId === null) {
      return;
    }
    const publisherId = selectedPublisherId;
    const designate = () =>
      writeThenRefresh(() => api.designate(territory.id, publisherId));

    if (open === null) {
      runGuarded(designate);
      return;
    }
    const nextName =
      publishers.find(publisher => publisher.id === publisherId)?.name ??
      'este publicador';
    confirmThen(
      'Designar território',
      replaceConfirmMessage(territory.name, open.publisher.name, nextName),
      'Designar',
      designate,
    );
  }, [
    api,
    confirmThen,
    open,
    publishers,
    runGuarded,
    selectedPublisherId,
    territory.id,
    territory.name,
    writeThenRefresh,
  ]);

  const requestComplete = useCallback(() => {
    if (open === null) {
      return;
    }
    confirmThen(
      'Marcar como concluído',
      completeConfirmMessage(territory.name, open.publisher.name),
      'Concluir',
      () => writeThenRefresh(() => api.completeAssignment(territory.id)),
    );
  }, [api, confirmThen, open, territory.id, territory.name, writeThenRefresh]);

  const requestDelete = useCallback(
    (assignment: Assignment) => {
      confirmThen(
        'Apagar designação',
        deleteConfirmMessage(assignment.publisher.name),
        'Apagar',
        () =>
          writeThenRefresh(() =>
            api.deleteAssignment(territory.id, assignment.id),
          ),
      );
    },
    [api, confirmThen, territory.id, writeThenRefresh],
  );

  // One element, two containers: scrolling or not is the only difference, and
  // branching on the wrapper keeps the card itself written once.
  const Container = scrollable ? ScrollView : View;
  const containerProps = scrollable
    ? { style: styles.panel, contentContainerStyle: styles.content }
    : { style: styles.content };

  return (
    <Container {...containerProps}>
      <Text style={styles.title}>Designações de {territory.name}</Text>

      {actionError !== null && (
        <Text accessible accessibilityRole="alert" style={styles.error}>
          {actionError}
        </Text>
      )}

      {isLoading ? (
        <ActivityIndicator accessibilityLabel="Carregando" />
      ) : loadError !== null ? (
        <Text accessible accessibilityRole="alert" style={styles.error}>
          {loadError}
        </Text>
      ) : (
        <>
          <Text style={styles.heading}>Designação atual</Text>
          {open === null ? (
            <Text style={styles.muted}>Sem designação</Text>
          ) : (
            <Text style={styles.current}>
              {open.publisher.name} — desde {formatDate(open.startedAt)}
            </Text>
          )}

          <Text style={styles.heading}>Histórico</Text>
          {history.length === 0 ? (
            <Text style={styles.muted}>
              Nenhuma designação concluída ainda.
            </Text>
          ) : (
            history.map(assignment => (
              <View
                key={assignment.id}
                style={styles.row}
                testID="assignment-history-row"
              >
                <Text style={styles.rowText}>
                  {assignment.publisher.name} —{' '}
                  {formatDate(assignment.startedAt)} a{' '}
                  {formatDate(assignment.completedAt)}
                </Text>
                <Pressable
                  accessibilityLabel={`Apagar designação de ${assignment.publisher.name}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: isWriting, busy: isWriting }}
                  disabled={isWriting}
                  onPress={() => requestDelete(assignment)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Apagar</Text>
                </Pressable>
              </View>
            ))
          )}

          <Text style={styles.heading}>Designar a…</Text>
          <PublisherPicker
            publishers={publishers}
            selectedPublisherId={selectedPublisherId}
            onSelect={setSelectedPublisherId}
            optionTestIdPrefix="designate-"
          />

          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled: selectedPublisherId === null || isWriting,
              busy: isWriting,
            }}
            disabled={selectedPublisherId === null || isWriting}
            onPress={requestDesignate}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {isWriting ? 'Atualizando…' : 'Designar'}
            </Text>
          </Pressable>

          {open !== null && (
            <Pressable
              accessibilityRole="button"
              disabled={isWriting}
              accessibilityState={{ disabled: isWriting, busy: isWriting }}
              onPress={requestComplete}
              style={styles.button}
            >
              <Text style={styles.buttonText}>
                {isWriting ? 'Atualizando…' : 'Marcar como concluído'}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    gap: spacing.sm,
    padding: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  heading: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  muted: {
    color: colors.textSecondary,
  },
  current: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  rowText: {
    color: colors.textPrimary,
    flex: 1,
  },
  button: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  buttonText: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.danger,
    padding: spacing.sm,
  },
  deleteButton: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  deleteButtonText: {
    color: colors.danger,
    fontWeight: '600',
  },
});

export default AssignmentPanel;
