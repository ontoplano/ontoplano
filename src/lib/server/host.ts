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
import { assertEntryWithinLimit } from '$lib/services/media.js';
import { servedMediaLimits } from './media-limits.js';
import { wake } from './services/reminder-clock.js';
import { assertPublicUrl, fetchPublic } from './outbound.js';

export function bindServerHost(): void {
	bindHost({
		emit,
		familyUserIds,
		assertWithinLimit,
		mediaLimits: servedMediaLimits,
		assertEntryWithinLimit,
		reminderScheduleChanged: wake,
		assertPublicUrl,
		// The dispatcher type is undici's own and not part of RequestInit;
		// the host signature speaks the platform's fetch.
		fetchPublic: fetchPublic as unknown as (url: string, init?: RequestInit) => Promise<Response>
	});
}
