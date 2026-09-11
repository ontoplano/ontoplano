/**
 * The server's answers to `$lib/services/host.ts`.
 *
 * Bound by `$lib/server/db/index.ts` right after the database, so any server
 * code that can reach data is also under the server's rules — webhooks
 * deliver, the family circle is read from the plan, and paid limits hold.
 */
import { bindHost } from '$lib/services/host.js';
import { emit } from './services/webhooks.js';
import { assertWithinLimit, familyUserIds } from './services/subscriptions.js';
import { assertEntryWithinLimit } from './services/media.js';
import { wake } from './services/reminder-clock.js';

export function bindServerHost(): void {
	bindHost({
		emit,
		familyUserIds,
		assertWithinLimit,
		assertEntryWithinLimit,
		reminderScheduleChanged: wake
	});
}
