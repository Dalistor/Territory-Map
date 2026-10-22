// The work half of a block: its history, the form that adds a record to it,
// and -- where the caller allows it -- the button that removes one.
//
// Extracted from `BlocksScreen` (spec 0013, Task 05) so the combined
// `BlockPanel` that opens from the map reuses it instead of growing a second
// copy that drifts. The two callers differ in exactly one power: the block
// list does not delete records (no `onDeleteLog`), the map panel does.
//
// Presentation only: it never builds a request nor sees a token. Both come in
// as props (`api` and `session`), which is also what lets every test drive it
// with fakes instead of a network.
import DateTimePicker from '@react-native-community/datetimepicker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { Block, Publisher, WorkLog } from '../../domain/models';
import { Button, QueryState } from '../components';
import { colors, radius, spacing, touchTarget } from '../theme';
import { PublisherPicker } from './PublisherPicker';

/** `dd/mm/yyyy` in local time -- how the desktop admin reads a visit too. */
export function formatDate(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0');
  return `${two(moment.getDate())}/${two(
    moment.getMonth() + 1,
  )}/${moment.getFullYear()}`;
}

/** `dd/mm/yyyy hh:mm`: a history row needs the time to tell two visits of one day apart. */
export function formatDateTime(moment: Date): string {
  const two = (value: number): string => value.toString().padStart(2, '0');
  return `${formatDate(moment)} ${two(moment.getHours())}:${two(
    moment.getMinutes(),
  )}`;
}

export const HISTORY_ERROR_MESSAGE =
  'Não foi possível carregar o histórico desta quadra.';
export const PUBLISHERS_ERROR_MESSAGE =
  'Não foi possível carregar os publicadores.';
export const MARK_ERROR_MESSAGE =
  'Não foi possível registrar o trabalho desta quadra.';
export const DELETE_LOG_ERROR_MESSAGE =
  'Não foi possível apagar o registro de trabalho.';
export const RELOAD_ERROR_MESSAGE =
  'O registro foi gravado, mas não foi possível recarregar a quadra.';

/**
 * The two server rules the admin cannot see from here, said out loud rather
 * than left for a rejected request to explain. The first is the whole
 * difference between this app and the publisher's: there, only the territory's
 * own leader may mark a block; here the admin records work done by anyone.
 */
export const ANY_PUBLISHER_NOTE =
  'O publicador não precisa ser o dirigente do território: o admin lança o trabalho de qualquer um.';
export const OVERRIDE_NOTE =
  'Um registro novo desfaz o status que tenha sido forçado no admin do computador.';
export const FUTURE_DATE_MESSAGE =
  'A data não pode estar no futuro: o servidor recusa um registro de trabalho que ainda não aconteceu.';

/**
 * Word for word in the shape the assignment confirmations use: what the admin
 * cannot take back, not just what the button does. Deleting a record moves the
 * block's `lastWorkedAt` back, which is the part that surprises.
 */
function deleteLogConfirmMessage(log: WorkLog): string {
  return (
    `Apagar o registro de ${log.publisher.name} em ${formatDateTime(
      log.workedAt,
    )}?\n\n` +
    'O registro sai do histórico da quadra e a última visita é recalculada a partir do que ' +
    'sobrar. Não há como desfazer.'
  );
}

/** Midnight of the day `moment` falls on, so two dates compare by day alone. */
function startOfDay(moment: Date): number {
  return new Date(
    moment.getFullYear(),
    moment.getMonth(),
    moment.getDate(),
  ).getTime();
}

/**
 * The server rejects a `worked_at` in the future, and finding that out from a
 * failed request would cost the admin a round trip in the field, often with no
 * signal to spare. Compared by day, not by instant: "today" is a whole day
 * here, and the picker hands back midnight of the day chosen.
 */
function isInTheFuture(workedAt: Date, now: Date): boolean {
  return startOfDay(workedAt) > startOfDay(now);
}

/** What an unknown rejection reads as: the server's own words when it gave any. */
function errorMessage(thrown: unknown, fallback: string): string {
  return thrown instanceof Error && thrown.message !== ''
    ? thrown.message
    : fallback;
}

/** The slice of the API client this section needs; a test hands it a fake. */
export interface BlockWorkSectionApi {
  listWorkLogs(blockId: string): Promise<WorkLog[]>;
  listPublishers(): Promise<Publisher[]>;
  markWorked(
    blockId: string,
    publisherId: string,
    workedAt: Date,
  ): Promise<WorkLog>;
}

/** The slice of the session this section needs -- it never sees a token. */
export interface BlockWorkSectionSession {
  run<T>(action: () => Promise<T>): Promise<T>;
}

export interface BlockWorkSectionProps {
  readonly block: Block;
  readonly session: BlockWorkSectionSession;
  readonly api: BlockWorkSectionApi;
  /** What the form counts as "today" -- pinned by a test, `new Date()` in life. */
  readonly now: Date;
  /**
   * Re-reads whatever the caller shows about this block after a record is
   * written or removed. Rejections surface here, in the section's own error
   * region, because this is where the admin is looking.
   */
  readonly onChanged: () => Promise<void>;
  /**
   * Removes one record, when the caller offers that at all. Absent means no
   * delete button: the block list is a reading surface, and the power to
   * remove a record lives where the admin already had to choose one block on
   * purpose. A capability, not a flag -- the button exists exactly when
   * something can carry out what it promises.
   */
  readonly onDeleteLog?: (log: WorkLog) => Promise<void>;
}

/**
 * The panel that opens under a block: its work history, and the form that adds
 * a record to it. Kept a component rather than inline markup so that
 * collapsing the row unmounts it -- which is what drops a half-filled form
 * instead of carrying it over to the next block the admin opens.
 */
export function BlockWorkSection({
  block,
  session,
  api,
  now,
  onChanged,
  onDeleteLog,
}: BlockWorkSectionProps): React.JSX.Element {
  const [logs, setLogs] = useState<WorkLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  // Nobody is preselected, unlike the desktop's `MarkWorkedForm`, which starts
  // on the territory's leader. On the phone the admin is often recording
  // someone else's work -- that is the whole point of `ANY_PUBLISHER_NOTE` --
  // and a name already filled in is the one that gets confirmed by accident.
  const [publisherId, setPublisherId] = useState<string | null>(null);
  // Today, which is the answer almost every time: the admin is standing on the
  // block he just finished.
  const [workedAt, setWorkedAt] = useState<Date>(now);
  const [isPickingDate, setIsPickingDate] = useState(false);
  const [isMarking, setIsMarking] = useState(false);
  // Which record is being removed: only its own button says so, the rest of
  // the history stays readable (and blocked, so two deletes never race).
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const deleteInFlight = useRef(false);

  const dateIsInTheFuture = isInTheFuture(workedAt, now);
  // `isMarking` belongs in the same flag rather than in a second guard inside
  // the handler: the button has to *look* unavailable while the request is in
  // flight, or the admin taps again and asks for a second record.
  const canMark = publisherId !== null && !dateIsInTheFuture && !isMarking;

  const loadLogs = useCallback(async () => {
    setIsLoading(true);
    setHistoryFailed(false);
    try {
      const loaded = await session.run(() => api.listWorkLogs(block.id));
      // Sorted here, not trusted from the API: the panel promises "most recent
      // first", and that promise has to hold whatever order the response
      // arrives in.
      setLogs(
        [...loaded].sort((a, b) => b.workedAt.getTime() - a.workedAt.getTime()),
      );
    } catch (thrown) {
      setError(errorMessage(thrown, HISTORY_ERROR_MESSAGE));
      setHistoryFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, [api, block.id, session]);

  /** "Tentar novamente" on a history that failed to load. */
  function retryHistory(): void {
    setError(null);
    loadLogs();
  }

  useEffect(() => {
    // Load on mount and set state when the promise settles: this project has
    // no Suspense boundary above the screens, the same way `app/` does it.
    loadLogs();
  }, [loadLogs]);

  useEffect(() => {
    let cancelled = false;
    session
      .run(() => api.listPublishers())
      .then(loaded => {
        if (!cancelled) setPublishers(loaded);
      })
      .catch((thrown: unknown) => {
        if (!cancelled)
          setError(errorMessage(thrown, PUBLISHERS_ERROR_MESSAGE));
      });
    return () => {
      cancelled = true;
    };
  }, [api, session]);

  async function markWorked(): Promise<void> {
    if (publisherId === null || !canMark) return;
    setIsMarking(true);
    setError(null);
    try {
      await session.run(() => api.markWorked(block.id, publisherId, workedAt));
    } catch (thrown) {
      // Nothing is reset here: the chosen publisher and date stay exactly as
      // they were, so a retry is one tap and not a form filled in twice.
      setError(errorMessage(thrown, MARK_ERROR_MESSAGE));
      setIsMarking(false);
      return;
    }
    try {
      await loadLogs();
      await onChanged();
    } catch (thrown) {
      // The record itself is already written -- this message is about the
      // reading that failed after it, and says so.
      setError(errorMessage(thrown, RELOAD_ERROR_MESSAGE));
    } finally {
      setIsMarking(false);
    }
  }

  /** `onPress` wants a synchronous handler; `markWorked` reports its own failures. */
  function handleMarkPress(): void {
    markWorked();
  }

  const deleteLog = useCallback(
    async (log: WorkLog): Promise<void> => {
      if (onDeleteLog === undefined) return;
      if (deleteInFlight.current) return;
      deleteInFlight.current = true;
      setDeletingLogId(log.id);
      setError(null);
      try {
        await onDeleteLog(log);
        await loadLogs();
        await onChanged();
      } catch (thrown) {
        setError(errorMessage(thrown, DELETE_LOG_ERROR_MESSAGE));
      } finally {
        deleteInFlight.current = false;
        setDeletingLogId(null);
      }
    },
    [loadLogs, onChanged, onDeleteLog],
  );

  /** Ask first, run only on "yes" -- the message is the whole point of it. */
  const requestDeleteLog = useCallback(
    (log: WorkLog): void => {
      Alert.alert('Apagar registro de trabalho', deleteLogConfirmMessage(log), [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            deleteLog(log);
          },
        },
      ]);
    },
    [deleteLog],
  );

  return (
    <View
      style={styles.panel}
      accessibilityLabel={`Trabalho da quadra ${block.number}`}
    >
      {error !== null && (
        <View style={styles.errorBox}>
          <Text
            accessibilityRole="alert"
            testID="block-work-error"
            style={styles.errorText}
          >
            {error}
          </Text>
          {historyFailed && (
            <Button label="Tentar novamente" variant="quiet" onPress={retryHistory} />
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Histórico desta quadra</Text>
      {isLoading ? (
        <QueryState
          compact
          kind="loading"
          title="Carregando histórico"
          message="Aguarde um momento."
        />
      ) : logs.length === 0 ? (
        historyFailed ? null : (
          <Text style={styles.note}>Esta quadra nunca foi trabalhada.</Text>
        )
      ) : (
        logs.map(log => (
          <View
            key={log.id}
            testID={`work-log-${log.id}`}
            style={styles.logRow}
          >
            <View style={styles.logText}>
              <Text style={styles.logName}>{log.publisher.name}</Text>
              <Text style={styles.logDate}>{formatDateTime(log.workedAt)}</Text>
            </View>
            {onDeleteLog !== undefined && (
              <Button
                label="Apagar"
                busyLabel="Apagando…"
                variant="danger"
                accessibilityLabel={`Apagar registro de ${log.publisher.name}`}
                busy={deletingLogId === log.id}
                disabled={deletingLogId !== null}
                onPress={() => requestDeleteLog(log)}
              />
            )}
          </View>
        ))
      )}

      <Text style={styles.sectionTitle}>Publicador</Text>
      <PublisherPicker
        publishers={publishers}
        selectedPublisherId={publisherId}
        onSelect={setPublisherId}
        optionTestIdPrefix="publisher-"
      />
      <Text style={styles.note}>{ANY_PUBLISHER_NOTE}</Text>

      <Pressable
        testID="pick-date"
        accessibilityRole="button"
        accessibilityLabel="Escolher a data"
        style={({ pressed }) => [styles.dateButton, pressed && styles.dateButtonPressed]}
        onPress={() => setIsPickingDate(true)}
      >
        <Text style={styles.dateText}>Data: {formatDate(workedAt)}</Text>
      </Pressable>
      {isPickingDate && (
        <DateTimePicker
          value={workedAt}
          mode="date"
          maximumDate={now}
          onChange={(_event, picked) => {
            // Android's dialog closes itself either way -- on a pick and on a
            // dismissal, where `picked` is absent and the date must not move.
            setIsPickingDate(false);
            if (picked !== undefined) setWorkedAt(picked);
          }}
        />
      )}
      {dateIsInTheFuture && (
        <Text style={styles.inlineError}>{FUTURE_DATE_MESSAGE}</Text>
      )}

      <Button
        testID="mark-worked"
        label="Marcar como trabalhada"
        busyLabel="Registrando…"
        variant="primary"
        disabled={!canMark}
        busy={isMarking}
        onPress={handleMarkPress}
        style={styles.markButton}
      />
      <Text style={styles.note}>{OVERRIDE_NOTE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dateButton: {
    backgroundColor: colors.surface,
    borderColor: colors.borderInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: spacing.sm,
    minHeight: touchTarget.default,
    paddingHorizontal: spacing.md,
  },
  dateButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  dateText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  errorBox: {
    alignItems: 'center',
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.sm,
  },
  errorText: {
    color: colors.dangerText,
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    paddingVertical: spacing.sm,
  },
  inlineError: {
    color: colors.dangerText,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.xs,
  },
  logDate: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  logName: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  logRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  logText: {
    flex: 1,
  },
  markButton: {
    marginTop: spacing.md,
  },
  note: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  panel: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: spacing.md,
  },
});

export default BlockWorkSection;
