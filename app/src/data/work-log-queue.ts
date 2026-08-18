/**
 * Local offline queue for "mark block as worked" actions.
 *
 * The map screen marks a block as done immediately -- optimistic, before any
 * network round trip -- CLAUDE.md's business rule for offline work:
 * "Marcação feita offline entra numa fila local ... e é enviada quando houver
 * rede. A UI mostra a quadra como concluída na hora." `enqueue` persists the
 * visit to `AsyncStorage` right away; `drain` is what a caller invokes
 * whenever there is a chance of network (app foreground, connectivity
 * regained) to flush the queue against the server through the injected
 * `ApiClient.markBlockWorked` (Task 18, `./api-client.ts`).
 *
 * `markBlockWorked` already collapses "201, newly created" and "200, resend
 * of a `logId` already seen" into the same resolved promise -- from this
 * queue's point of view both are "the server accepted it", so both drain the
 * item the same way.
 *
 * The two ways `markBlockWorked` can fail get different treatment:
 * - `NetworkException` -- the request never reached the server (offline, DNS,
 *   refused connection). Nothing about the item is wrong; it stays queued for
 *   the next `drain`, and `drain` itself does not throw for this.
 * - `ApiErrorException` -- the server *did* answer, and rejected the log for
 *   a business reason (invalid payload, territory no longer assigned...).
 *   Resending the exact same `logId` will not change that outcome, so the
 *   item is dropped from the queue -- retrying it forever would be pointless
 *   -- and `drain` rejects with `WorkLogDrainError` so the caller (the map
 *   screen) can tell the publisher which visits were not accepted.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { ApiErrorException, NetworkException, type ApiClient } from './api-client';

/** Namespaced the same way `session-store.ts` and `territory-cache.ts` namespace their entries. */
const STORAGE_KEY = 'territory-map/work-log-queue';

export interface QueuedWorkLog {
  readonly logId: string;
  readonly blockId: string;
  readonly workedAt: Date;
}

/** `QueuedWorkLog` as it exists after a JSON round trip: `Date` degrades to `string`. */
interface StoredWorkLog {
  readonly logId: string;
  readonly blockId: string;
  readonly workedAt: string;
}

/** One queued visit the server rejected outright while draining the queue. */
export interface WorkLogDrainFailure {
  readonly log: QueuedWorkLog;
  readonly error: ApiErrorException;
}

/**
 * Thrown by `drain` when at least one queued item came back with an
 * `ApiErrorException`. Those items are already gone from the queue by the
 * time this is thrown -- resending them would not help; this is only how the
 * caller learns which visits need the publisher's attention.
 */
export class WorkLogDrainError extends Error {
  readonly failures: readonly WorkLogDrainFailure[];

  constructor(failures: readonly WorkLogDrainFailure[]) {
    super(`${failures.length} marcação(ões) foram rejeitadas pelo servidor.`);
    this.name = 'WorkLogDrainError';
    this.failures = failures;
  }
}

export interface WorkLogQueue {
  enqueue(blockId: string, workedAt: Date): Promise<void>;
  drain(token: string): Promise<void>;
  pending(): Promise<QueuedWorkLog[]>;
}

export interface CreateWorkLogQueueOptions {
  readonly apiClient: Pick<ApiClient, 'markBlockWorked'>;
}

function toQueuedWorkLog(stored: StoredWorkLog): QueuedWorkLog {
  return { logId: stored.logId, blockId: stored.blockId, workedAt: new Date(stored.workedAt) };
}

async function readQueue(): Promise<StoredWorkLog[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  return JSON.parse(raw) as StoredWorkLog[];
}

async function writeQueue(queue: StoredWorkLog[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

export function createWorkLogQueue(options: CreateWorkLogQueueOptions): WorkLogQueue {
  const { apiClient } = options;

  return {
    async enqueue(blockId, workedAt) {
      const queue = await readQueue();
      queue.push({ logId: uuidv4(), blockId, workedAt: workedAt.toISOString() });
      await writeQueue(queue);
    },

    async drain(token) {
      const queue = await readQueue();
      const remaining: StoredWorkLog[] = [];
      const failures: WorkLogDrainFailure[] = [];

      for (const item of queue) {
        try {
          await apiClient.markBlockWorked(
            token,
            item.blockId,
            item.logId,
            new Date(item.workedAt),
          );
        } catch (error) {
          if (error instanceof NetworkException) {
            remaining.push(item);
          } else if (error instanceof ApiErrorException) {
            failures.push({ log: toQueuedWorkLog(item), error });
          } else {
            throw error;
          }
        }
      }

      await writeQueue(remaining);

      if (failures.length > 0) {
        throw new WorkLogDrainError(failures);
      }
    },

    async pending() {
      const queue = await readQueue();
      return queue.map(toQueuedWorkLog);
    },
  };
}
