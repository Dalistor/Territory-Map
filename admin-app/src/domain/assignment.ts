// The pure rules the S-13 card reads: which line is the one in force, and in
// what order the card shows them. The server is the authority on what an
// assignment *is* -- these functions only decide how a list of them is read.
import type { Assignment, CampaignBrief } from './models';

/**
 * `true` only while the assignment has no completion date. That is the whole
 * definition: `completedAt === null` is what the server means by "open", and
 * the partial unique index `uq_territory_assignments_open` is what guarantees
 * a territory never has two of them at once.
 */
export function assignmentIsOpen(assignment: Assignment): boolean {
  return assignment.completedAt === null;
}

/**
 * The line in force on a card, or `null` when the territory is free. A card
 * whose lines are all completed has nobody responsible, and so does an empty
 * one -- both are legitimate states, and neither is an error to report.
 */
export function openAssignment(assignments: Assignment[]): Assignment | null {
  return assignments.find(assignmentIsOpen) ?? null;
}

/**
 * The card in reading order: newest start first, with the open assignment ahead
 * of a completed one that started the same moment.
 *
 * The tie is not hypothetical -- designating someone closes the previous
 * assignment with today's date and opens the new one in the same call, so two
 * lines can share a start instant. The open one belongs on top there, because
 * it is the answer to "who has this territory now".
 *
 * A **new** list comes back: the caller's array is state a screen re-renders
 * from, and sorting it in place would mutate what React was handed.
 */
export function sortAssignments(assignments: Assignment[]): Assignment[] {
  return [...assignments].sort((a, b) => {
    const byStart = b.startedAt.getTime() - a.startedAt.getTime();
    if (byStart !== 0) {
      return byStart;
    }
    return Number(assignmentIsOpen(b)) - Number(assignmentIsOpen(a));
  });
}

/** How a campaign is named wherever a dirigente would otherwise be. */
export function campaignLabel(campaign: CampaignBrief): string {
  return `Campanha: ${campaign.name}`;
}

/**
 * `true` for a line written by a campaign rather than by an individual
 * designation. Such a line belongs to the campaign: the server refuses to
 * edit, complete or delete it through the card (409 `campaign_assignment`),
 * so the card offers no action on it.
 */
export function isCampaignAssignment(assignment: Assignment): boolean {
  return assignment.campaign !== null && assignment.campaign !== undefined;
}

/**
 * Who held the territory on this line, as the card reads it: the
 * publisher's name, or "Campanha: <nome>" on a campaign line.
 */
export function assignmentHolderLabel(assignment: Assignment): string {
  if (assignment.campaign) {
    return campaignLabel(assignment.campaign);
  }
  // By contract exactly one of the two is set; the dash only keeps a
  // malformed row readable instead of crashing the card.
  return assignment.publisher?.name ?? '—';
}
