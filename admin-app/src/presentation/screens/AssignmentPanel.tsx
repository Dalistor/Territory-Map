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
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  assignmentHolderLabel,
  assignmentIsOpen,
  isCampaignAssignment,
  openAssignment as findOpenAssignment,
  sortAssignments,
} from '../../domain/assignment';
import type { Assignment, Publisher, Territory } from '../../domain/models';
import type { AssignmentUpdatePayload } from '../../data/api-client';
import { Button, QueryState } from '../components';
import { colors, radius, shadows, spacing, touchTarget } from '../theme';
import { formatDate } from './BlockWorkSection';
import { PublisherPicker } from './PublisherPicker';

/** Only the API surface this panel needs -- the real `ApiClient` satisfies it. */
export interface AssignmentPanelApi {
  listAssignments(territoryId: string): Promise<Assignment[]>;
  listPublishers(): Promise<Publisher[]>;
  designate(territoryId: string, publisherId: string): Promise<unknown>;
  updateAssignment(
    territoryId: string,
    assignmentId: string,
    payload: AssignmentUpdatePayload,
  ): Promise<unknown>;
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
  /**
   * Whether the card repeats the territory's name as its own title. The
   * territory detail already names it in its summary, so it turns this off.
   */
  readonly showTitle?: boolean;
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
 * Why the card offers no designating while a campaign holds the territory.
 * The campaign is managed on the desktop only, and the server would refuse an
 * individual designation anyway (409 `territory_in_campaign`) -- so the panel
 * says where it is done instead of offering a button that cannot work. Marking
 * a block is a different route and stays available, which the text says too,
 * so the admin does not read the lock as covering the whole territory.
 */
export function campaignLockMessage(campaignName: string): string {
  return (
    `Este território está na campanha "${campaignName}". Para designá-lo a um ` +
    'dirigente, conclua a campanha no admin do computador. Marcar quadras ' +
    'continua disponível aqui.'
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
  showTitle = true,
}: AssignmentPanelProps): React.JSX.Element {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(
    null,
  );
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(
    null,
  );
  const [editPublisherId, setEditPublisherId] = useState<string | null>(null);
  const [editStartedAt, setEditStartedAt] = useState<Date>(new Date());
  const [editCompletedAt, setEditCompletedAt] = useState<Date>(new Date());
  const [editReopen, setEditReopen] = useState(false);
  const [isPickingStartDate, setIsPickingStartDate] = useState(false);
  const [isPickingEndDate, setIsPickingEndDate] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
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

  /**
   * Loads the card and says how it went. A card that failed to load must not
   * read as "nobody is assigned here" -- that is a different fact, and the
   * admin would act on it -- so the failure gets its own state with a retry.
   */
  const loadCard = useCallback(
    async (isCancelled: () => boolean = () => false) => {
      setIsLoading(true);
      setLoadError(null);
      try {
        await load();
      } catch (error: unknown) {
        if (!isCancelled()) setLoadError(errorMessage(error));
      } finally {
        if (!isCancelled()) setIsLoading(false);
      }
    },
    [load],
  );

  useEffect(() => {
    let cancelled = false;
    loadCard(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadCard]);

  const open = findOpenAssignment(assignments);
  // Sorted newest-first by the domain rule, then narrowed to the completed
  // lines: the open one already has its own section above, and saying "not
  // open" in the type is what keeps the row free of an impossible "and if
  // there is no completion date?" branch.
  const history = sortAssignments(assignments).filter(assignmentIsCompleted);
  // The card's own open line is the freshest word on it; the territory's
  // projection covers the moment before the card has loaded.
  const activeCampaign =
    (open !== null ? open.campaign : territory.campaign) ?? null;

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
      replaceConfirmMessage(
        territory.name,
        assignmentHolderLabel(open),
        nextName,
      ),
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
      completeConfirmMessage(territory.name, assignmentHolderLabel(open)),
      'Concluir',
      () => writeThenRefresh(() => api.completeAssignment(territory.id)),
    );
  }, [api, confirmThen, open, territory.id, territory.name, writeThenRefresh]);

  const requestDelete = useCallback(
    (assignment: Assignment) => {
      confirmThen(
        'Apagar designação',
        deleteConfirmMessage(assignmentHolderLabel(assignment)),
        'Apagar',
        () =>
          writeThenRefresh(() =>
            api.deleteAssignment(territory.id, assignment.id),
          ),
      );
    },
    [api, confirmThen, territory.id, writeThenRefresh],
  );

  const openEditModal = useCallback((assignment: Assignment) => {
    setEditingAssignment(assignment);
    setEditPublisherId(assignment.publisher?.id ?? null);
    setEditStartedAt(assignment.startedAt);
    setEditCompletedAt(assignment.completedAt ?? new Date());
    setEditReopen(false);
    setEditError(null);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditingAssignment(null);
    setEditError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (editingAssignment === null || editPublisherId === null) {
      return;
    }
    const isCompleted = editingAssignment.completedAt !== null && !editReopen;
    if (isCompleted && editStartedAt.getTime() > editCompletedAt.getTime()) {
      setEditError('A retirada deve ser anterior ou igual à devolução.');
      return;
    }

    setEditError(null);
    await writeThenRefresh(async () => {
      await api.updateAssignment(territory.id, editingAssignment.id, {
        publisherId: editPublisherId,
        startedAt: editStartedAt,
        completedAt: isCompleted ? editCompletedAt : undefined,
        clearCompletedAt: editReopen,
      });
      closeEditModal();
    });
  }, [
    api,
    closeEditModal,
    editCompletedAt,
    editPublisherId,
    editReopen,
    editStartedAt,
    editingAssignment,
    territory.id,
    writeThenRefresh,
  ]);

  // One element, two containers: scrolling or not is the only difference, and
  // branching on the wrapper keeps the card itself written once.
  const Container = scrollable ? ScrollView : View;
  const containerProps = scrollable
    ? { style: styles.panel, contentContainerStyle: styles.content }
    : { style: styles.content };

  return (
    <Container {...containerProps}>
      {showTitle && (
        <Text accessibilityRole="header" style={styles.title}>
          Designações de {territory.name}
        </Text>
      )}

      {actionError !== null && (
        <Text accessible accessibilityRole="alert" style={styles.error}>
          {actionError}
        </Text>
      )}

      {isLoading ? (
        <QueryState
          kind="loading"
          title="Carregando designações"
          message="Aguarde um momento."
        />
      ) : loadError !== null ? (
        <QueryState
          kind="error"
          title="Não foi possível carregar"
          message={loadError}
          onRetry={() => {
            loadCard();
          }}
        />
      ) : (
        <>
          <Text style={styles.heading}>Dirigente atual</Text>
          {open === null ? (
            <Text style={styles.muted}>Sem designação</Text>
          ) : (
            <View style={styles.currentCard}>
              <Text style={styles.current}>{assignmentHolderLabel(open)}</Text>
              <Text style={styles.currentMeta}>
                Retirada: {formatDate(open.startedAt)} · Em andamento
              </Text>
              {/* A campaign line is the campaign's, managed on the desktop. */}
              {!isCampaignAssignment(open) && (
                <View style={styles.currentActions}>
                  {/* Completing sits on the assignment it closes, as a
                      secondary action: one solid primary per card. */}
                  <Button
                    label="Marcar como concluído"
                    busyLabel="Atualizando…"
                    busy={isWriting}
                    onPress={requestComplete}
                    style={styles.currentActionMain}
                  />
                  <Button
                    label="Editar"
                    accessibilityLabel={`Editar designação de ${assignmentHolderLabel(open)}`}
                    disabled={isWriting}
                    onPress={() => openEditModal(open)}
                  />
                </View>
              )}
            </View>
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
                <Text style={styles.rowTitle}>
                  {assignmentHolderLabel(assignment)}
                </Text>
                <Text style={styles.rowMeta}>
                  Retirada: {formatDate(assignment.startedAt)} · Devolução:{' '}
                  {formatDate(assignment.completedAt)}
                </Text>
                {!isCampaignAssignment(assignment) && (
                  // Editing and deleting sit at opposite ends of the row:
                  // deleting cannot be undone, so it is never next to the
                  // button the thumb reaches for most.
                  <View style={styles.rowActions}>
                    <Button
                      label="Editar"
                      accessibilityLabel={`Editar designação de ${assignmentHolderLabel(
                        assignment,
                      )}`}
                      disabled={isWriting}
                      onPress={() => openEditModal(assignment)}
                    />
                    <Button
                      label="Apagar"
                      variant="danger"
                      accessibilityLabel={`Apagar designação de ${assignmentHolderLabel(
                        assignment,
                      )}`}
                      disabled={isWriting}
                      onPress={() => requestDelete(assignment)}
                    />
                  </View>
                )}
              </View>
            ))
          )}

          {activeCampaign !== null ? (
            <Text accessible style={styles.campaignNotice}>
              {campaignLockMessage(activeCampaign.name)}
            </Text>
          ) : (
            <>
              <Text style={styles.heading}>Designar a…</Text>
              <PublisherPicker
                publishers={publishers}
                selectedPublisherId={selectedPublisherId}
                onSelect={setSelectedPublisherId}
                optionTestIdPrefix="designate-"
              />

              <Button
                label="Designar publicador"
                busyLabel="Atualizando…"
                variant="primary"
                disabled={selectedPublisherId === null}
                busy={isWriting}
                onPress={requestDesignate}
              />
            </>
          )}
        </>
      )}

      {editingAssignment !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={closeEditModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                {assignmentIsOpen(editingAssignment)
                  ? 'Editar designação atual'
                  : 'Editar designação passada'}
              </Text>

              {/* The fields scroll; the actions stay pinned under them, so
                  "Salvar" is reachable even with the whole publisher list
                  open on a small phone. */}
              <ScrollView
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                keyboardShouldPersistTaps="handled"
              >
                {editError !== null && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {editError}
                  </Text>
                )}

                <Text style={styles.heading}>Dirigente</Text>
                <PublisherPicker
                  publishers={publishers}
                  selectedPublisherId={editPublisherId}
                  onSelect={setEditPublisherId}
                  optionTestIdPrefix="edit-publisher-"
                />

                <Text style={styles.heading}>Retirada</Text>
                <Pressable
                  accessibilityLabel="Escolher data de retirada"
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.datePickerButton,
                    pressed && styles.datePickerButtonPressed,
                  ]}
                  onPress={() => setIsPickingStartDate(true)}
                >
                  <Text style={styles.datePickerButtonText}>
                    {formatDate(editStartedAt)}
                  </Text>
                </Pressable>
                {isPickingStartDate && (
                  <DateTimePicker
                    value={editStartedAt}
                    mode="date"
                    onChange={(_event, picked) => {
                      setIsPickingStartDate(false);
                      if (picked !== undefined) setEditStartedAt(picked);
                    }}
                  />
                )}

                {!assignmentIsOpen(editingAssignment) && (
                  <>
                    <Text style={styles.heading}>Devolução</Text>
                    <Pressable
                      accessibilityLabel="Escolher data de devolução"
                      accessibilityRole="button"
                      accessibilityState={{ disabled: editReopen }}
                      disabled={editReopen}
                      style={({ pressed }) => [
                        styles.datePickerButton,
                        editReopen && styles.datePickerButtonDisabled,
                        pressed && styles.datePickerButtonPressed,
                      ]}
                      onPress={() => setIsPickingEndDate(true)}
                    >
                      <Text
                        style={[
                          styles.datePickerButtonText,
                          editReopen && styles.datePickerButtonTextDisabled,
                        ]}
                      >
                        {formatDate(editCompletedAt)}
                      </Text>
                    </Pressable>
                    {isPickingEndDate && (
                      <DateTimePicker
                        value={editCompletedAt}
                        mode="date"
                        onChange={(_event, picked) => {
                          setIsPickingEndDate(false);
                          if (picked !== undefined) setEditCompletedAt(picked);
                        }}
                      />
                    )}

                    {open === null && (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityLabel="Reabrir designação (tornar em andamento)"
                        accessibilityState={{ checked: editReopen }}
                        style={styles.reopenRow}
                        onPress={() => setEditReopen(!editReopen)}
                      >
                        <View
                          style={[
                            styles.checkbox,
                            editReopen && styles.checkboxChecked,
                          ]}
                        >
                          {editReopen && <View style={styles.checkboxMark} />}
                        </View>
                        <Text style={styles.reopenText}>
                          Reabrir designação (tornar em andamento)
                        </Text>
                      </Pressable>
                    )}
                  </>
                )}
              </ScrollView>

              <View style={styles.modalActions}>
                <Button
                  label="Cancelar"
                  accessibilityLabel="Cancelar edição"
                  onPress={closeEditModal}
                />
                <Button
                  label="Salvar"
                  busyLabel="Salvando…"
                  variant="primary"
                  accessibilityLabel="Salvar alterações"
                  busy={isWriting}
                  onPress={handleSaveEdit}
                />
              </View>
            </View>
          </View>
        </Modal>
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
    fontSize: 20,
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
    fontSize: 14,
  },
  campaignNotice: {
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.warningText,
    marginTop: spacing.sm,
    padding: spacing.md,
  },
  currentCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  current: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  currentMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  currentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  currentActionMain: {
    flexGrow: 1,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md,
  },
  rowTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
  },
  rowMeta: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  error: {
    backgroundColor: colors.dangerSurface,
    borderColor: colors.dangerBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.dangerText,
    padding: spacing.sm,
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: colors.scrim,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    maxHeight: '90%',
    padding: spacing.lg,
    width: '100%',
    ...shadows.md,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  modalBody: {
    flexGrow: 0,
    flexShrink: 1,
  },
  modalBodyContent: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  datePickerButton: {
    backgroundColor: colors.surface,
    borderColor: colors.borderInput,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: touchTarget.default,
    paddingHorizontal: spacing.md,
  },
  datePickerButtonPressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  datePickerButtonDisabled: {
    backgroundColor: colors.disabledSurface,
    borderColor: colors.disabledSurface,
  },
  datePickerButtonText: {
    color: colors.textPrimary,
    fontSize: 15,
  },
  datePickerButtonTextDisabled: {
    color: colors.disabledText,
  },
  reopenRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
    minHeight: touchTarget.default,
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.borderInput,
    borderRadius: radius.xs,
    borderWidth: 2,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    backgroundColor: colors.onPrimary,
    borderRadius: 1,
    height: 10,
    width: 10,
  },
  reopenText: {
    color: colors.textPrimary,
    flex: 1,
    fontSize: 15,
  },
  modalActions: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
    paddingTop: spacing.md,
  },
});

export default AssignmentPanel;
