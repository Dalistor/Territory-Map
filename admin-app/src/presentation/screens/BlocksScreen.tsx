// The blocks of one territory, and the one write the admin does in the field:
// recording that a block was worked.
//
// It mirrors the block table of the desktop's `TerritorySettingsScreen` plus
// the history half of its `BlockWorkPanel`, minus the two powers that stay on
// the desktop by decision of spec 0012: deleting a work record and forcing a
// block's status. Reading a forced status is still here -- the label says so --
// because the admin has to understand the colour he is looking at.
//
// A field report (2026-08-26) asked for the territory to show up on a map
// here too, with its blocks numbered -- the same context the main map gives,
// scoped to just this territory instead of the whole congregation. Reusing
// `AssignmentsMapView` with a single-territory array does that for free: it
// already draws whatever `territories` it is handed, colour and number
// included, with no code of its own to write. Tapping a block on this map
// opens the same `BlockWorkSection` a tap on its row does.
//
// Presentation only: it never builds a request nor sees a token. Both come in
// as props (`api` and `session`), which is also what lets every test drive it
// with fakes instead of a network.
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { blockStatusLabel } from '../../domain/blockStatusLabel';
import type { Block, LatLng, Territory } from '../../domain/models';
import { AssignmentsMapView } from '../map/AssignmentsMapView';
import { colors, radius, spacing } from '../theme';
import { BlockWorkSection, formatDate } from './BlockWorkSection';
import type { BlockWorkSectionApi, BlockWorkSectionSession } from './BlockWorkSection';

/**
 * An empty territory is not a bug and not an empty list either -- drawing a
 * block is one of the things this app deliberately does not do, so the screen
 * says where it is done instead of leaving a blank page.
 */
const NO_BLOCKS_MESSAGE =
  'Este território ainda não tem nenhuma quadra. As quadras são desenhadas no admin do computador.';

/** The slice of the API client this screen needs; a test hands it a fake. */
export interface BlocksScreenApi extends BlockWorkSectionApi {
  getTerritory(territoryId: string): Promise<Territory>;
}

/** The slice of the session this screen needs -- it never sees a token. */
export type BlocksScreenSession = BlockWorkSectionSession;

export interface BlocksScreenProps {
  /** The territory, with its blocks already loaded by the caller. */
  readonly territory: Territory;
  readonly session: BlocksScreenSession;
  readonly api: BlocksScreenApi;
  /** Overridable so a test can pin what counts as "today". */
  readonly now?: Date;
  /**
   * Where the embedded map centres if this territory somehow has no
   * demarcation yet -- the same fallback `DesignationsScreen` already
   * threads to the main map.
   */
  readonly fallbackCenter?: LatLng;
  /**
   * A territory detail owns the vertical gesture for both segments. In that
   * composition this component contributes content only, avoiding two
   * competing `ScrollView`s. Standalone use keeps the original scroll.
   */
  readonly scrollable?: boolean;
  /**
   * Lets the territory detail promote one block to the combined panel, where
   * deleting an incorrect work log remains available. Without it, this list
   * keeps its compact inline work section.
   */
  readonly onOpenBlock?: (block: Block) => void;
}

export function BlocksScreen({
  territory,
  session,
  api,
  now,
  fallbackCenter,
  scrollable = true,
  onOpenBlock,
}: BlocksScreenProps): React.JSX.Element {
  const moment = now ?? new Date();

  // The caller hands the territory over already loaded, so a record added
  // below would otherwise leave the list showing the state of the moment the
  // admin arrived. This holds the version fetched after a marking; the prop
  // stays the fallback, and the id guard drops a refresh that belongs to a
  // territory the admin has already navigated away from.
  const [refreshed, setRefreshed] = useState<Territory | null>(null);
  const current = refreshed !== null && refreshed.id === territory.id ? refreshed : territory;

  // Ordered here rather than trusted from the API: the list is read as a
  // numbered one, and blocks that came back in creation order would read as
  // shuffled.
  const blocks = useMemo<Block[]>(
    () => [...current.blocks].sort((a, b) => a.number - b.number),
    [current.blocks],
  );

  // Which block has its panel open, or `null` for none. One id, not a set:
  // opening another block moves the panel instead of stacking a second one,
  // which is what keeps the list readable while the admin walks block by
  // block.
  const [openBlockId, setOpenBlockId] = useState<string | null>(null);

  /**
   * Re-reads this territory after a work record was accepted, so the row's
   * status and last visit stop contradicting what was just written. Rejects
   * on failure rather than swallowing it: the panel that asked for the
   * refresh is the one with a place to show the message.
   */
  const reloadTerritory = useCallback(async () => {
    setRefreshed(await session.run(() => api.getTerritory(territory.id)));
  }, [api, session, territory.id]);

  // A single-territory array, not the territory alone: `AssignmentsMapView`
  // already knows how to draw a list of territories with their blocks, so
  // handing it one is the whole integration, not a special case of it.
  const mapTerritories = useMemo(() => [current], [current]);

  /** Tapping a block on the map opens it exactly like tapping its row does. */
  const handleSelectBlock = useCallback((block: Block) => {
    if (onOpenBlock !== undefined) {
      onOpenBlock(block);
      return;
    }
    setOpenBlockId(openId => (openId === block.id ? null : block.id));
  }, [onOpenBlock]);

  const Container = scrollable ? ScrollView : View;
  const containerProps = scrollable
    ? { style: styles.screen, contentContainerStyle: styles.screenContent }
    : { style: styles.screenContent };

  return (
    <Container {...containerProps}>
      <Text style={styles.title}>{current.name}</Text>

      {blocks.length > 0 && (
        <View style={styles.map}>
          <AssignmentsMapView
            territories={mapTerritories}
            fallbackCenter={fallbackCenter}
            onSelectBlock={handleSelectBlock}
          />
        </View>
      )}

      {blocks.length === 0 ? (
        <Text style={styles.emptyMessage}>{NO_BLOCKS_MESSAGE}</Text>
      ) : (
        blocks.map(block => (
          <View key={block.id} style={styles.card}>
            <Pressable
              testID={`block-row-${block.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Quadra ${block.number}`}
              accessibilityState={{ expanded: openBlockId === block.id }}
              style={styles.row}
              onPress={() => handleSelectBlock(block)}>
              <Text style={styles.blockNumber}>Quadra {block.number}</Text>
              <View style={styles.rowDetails}>
                <Text style={styles.blockStatus}>
                  {blockStatusLabel(block, moment, current.rotationDays)}
                </Text>
                {block.lastWorkedAt !== null && (
                  <Text style={styles.blockLastVisit}>
                    Última visita: {formatDate(block.lastWorkedAt)}
                  </Text>
                )}
              </View>
            </Pressable>
            {openBlockId === block.id && (
              <BlockWorkSection
                block={block}
                session={session}
                api={api}
                now={moment}
                onChanged={reloadTerritory}
              />
            )}
          </View>
        ))
      )}
    </Container>
  );
}

// The palette comes from `../theme`, like every other screen of this app: the
// literals that used to live here dated from before `theme.ts` existed. Sizes
// that no token names exactly stay as numbers -- the point of spec 0013's Task
// 07 is one palette, not a bigger one, and rounding a padding to the nearest
// token would change the layout. The block status colours stay out of the
// theme on purpose; they belong to the domain.
const styles = StyleSheet.create({
  map: {
    borderRadius: radius.md,
    // Clips the map's `Marker`s to its own box, same reason
    // `DesignationsScreen` needs it on the main map: Android does not clip a
    // native view to its parent's bounds on its own, and without this a
    // block number near the top edge would draw up into the title.
    height: 220,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  blockLastVisit: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  blockNumber: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  blockStatus: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  dateButton: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    marginTop: spacing.sm,
    padding: 12,
  },
  emptyMessage: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  error: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  logDate: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  logName: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  markButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    marginTop: 12,
    padding: 14,
  },
  markButtonDisabled: {
    backgroundColor: colors.disabledSurface,
  },
  markButtonText: {
    color: colors.onPrimary,
    fontWeight: '600',
  },
  note: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  panel: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: spacing.md,
  },
  publisherRow: {
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginTop: 6,
    padding: 12,
  },
  publisherRowSelected: {
    backgroundColor: colors.primaryLight,
    borderColor: colors.primary,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
  },
  rowDetails: {
    alignItems: 'flex-end',
  },
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  screenContent: {
    padding: spacing.md,
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 12,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
});

export default BlocksScreen;
