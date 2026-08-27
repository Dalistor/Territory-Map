// What opens when the admin taps a block on the map (spec 0013, Task 05): one
// place with the two levels of action that block sits between.
//
// The top half is the block itself -- its status in words, its work history,
// and the two writes that change it: recording a visit and removing a record
// entered by mistake. The bottom half is the *territory* that contains it:
// who is leading it, and designating, completing or deleting a line of the
// S-13 card.
//
// The separation between them is not decoration, and neither is the sentence
// that labels it. Designating changes who is responsible for every block in
// the territory, not for the one the admin just tapped, and the tap that gets
// there started as "let me mark this block" -- so the panel says whose scope
// it is before offering the button.
//
// Nothing is rewritten here: the work half is `BlockWorkSection` (the same one
// the block list uses, handed the delete capability it withholds) and the
// territory half is `AssignmentPanel` (the same S-13 card, with its own scroll
// switched off, so this panel scrolls once instead of fighting itself).
import React, { useCallback } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { blockStatusLabel } from '../../domain/blockStatusLabel';
import type { Block, Territory, WorkLog } from '../../domain/models';
import { colors, radius, spacing } from '../theme';
import { AssignmentPanel } from './AssignmentPanel';
import type { AssignmentPanelApi, AssignmentPanelSession } from './AssignmentPanel';
import { BlockWorkSection } from './BlockWorkSection';
import type { BlockWorkSectionApi } from './BlockWorkSection';

/**
 * Said next to the territory heading rather than left implicit: the admin
 * arrived here by tapping one block, and everything below this line applies to
 * all of them.
 */
export const TERRITORY_SCOPE_NOTE =
  'Designar, concluir ou apagar uma designação afeta o território inteiro, não só esta quadra.';

/** Everything this panel asks of the API -- the real `ApiClient` satisfies it. */
export interface BlockPanelApi extends AssignmentPanelApi, BlockWorkSectionApi {
  /** Not in the block list's slice: deleting a record is one of the reasons this panel exists. */
  deleteWorkLog(logId: string): Promise<void>;
}

/** Only `run` -- the panel never signs in and never sees the token. */
export type BlockPanelSession = AssignmentPanelSession;

export interface BlockPanelProps {
  readonly block: Block;
  /** The territory that owns the block: its rotation decides the status, its card is below. */
  readonly territory: Territory;
  readonly session: BlockPanelSession;
  readonly api: BlockPanelApi;
  /** Overridable so a test can pin what counts as "today". */
  readonly now?: Date;
  /**
   * Fired after every write that lands, on either half. A visit moves the
   * block's colour and a designation moves the territory's leader, and both are
   * drawn on the map behind this panel -- the screen that opened it reloads on
   * this signal instead of going stale.
   */
  readonly onChanged?: () => void;
}

export function BlockPanel({
  block,
  territory,
  session,
  api,
  now,
  onChanged,
}: BlockPanelProps): React.JSX.Element {
  const moment = now ?? new Date();

  /**
   * `BlockWorkSection` awaits this and shows whatever it rejects with, so the
   * caller's synchronous callback is wrapped rather than called raw.
   */
  const handleWorkChanged = useCallback(async () => {
    onChanged?.();
  }, [onChanged]);

  /** The delete capability the block list deliberately does not hand over. */
  const handleDeleteLog = useCallback(
    (log: WorkLog) => session.run(() => api.deleteWorkLog(log.id)),
    [api, session],
  );

  return (
    <ScrollView style={styles.panel} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Quadra {block.number}</Text>
        <Text style={styles.status}>
          {blockStatusLabel(block, moment, territory.rotationDays)}
        </Text>
      </View>

      <BlockWorkSection
        block={block}
        session={session}
        api={api}
        now={moment}
        onChanged={handleWorkChanged}
        onDeleteLog={handleDeleteLog}
      />

      <View style={styles.territorySection}>
        <Text style={styles.territoryHeading}>Território: {territory.name}</Text>
        <Text style={styles.territoryNote}>{TERRITORY_SCOPE_NOTE}</Text>
        <AssignmentPanel
          territory={territory}
          session={session}
          api={api}
          onChanged={onChanged}
          scrollable={false}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  header: {
    padding: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  status: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  // The visible seam between "this block" and "this whole territory": its own
  // surface, its own border, and the note above the card saying so.
  territorySection: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    margin: spacing.md,
    paddingTop: spacing.md,
  },
  territoryHeading: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: spacing.md,
  },
  territoryNote: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
});

export default BlockPanel;
