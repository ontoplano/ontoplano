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
import { loadConfig } from './config.js';
import { capabilities, docsUrl, siteUrl } from './settings.js';
import { instanceIsEmpty, registrationMode } from './services/registration.js';
import { RINGER_TOKEN_NAME, listTokens } from './services/tokens.js';
import { clientErrorState, setClientErrorConsent } from './services/client-errors.js';
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
		fetchPublic: fetchPublic as unknown as (url: string, init?: RequestInit) => Promise<Response>,
		/*
		 * The door and the error-report question are both facts about a
		 * deployment, and both used to be assembled in a route's own file —
		 * which is the one thing that made two of these routes need a second
		 * file. They come through the seam now, so `/` and
		 * `/settings/preferences` are one file each like everything else.
		 */
		frontDoor: () => ({
			canRegister: instanceIsEmpty() || registrationMode() !== 'closed',
			// The operator's sentence, not the app's — see config.toml.
			tagline: loadConfig().instance.tagline,
			// Where this deployment's own site and docs are. Production answers
			// with the project's; staging answers with staging's.
			siteUrl: siteUrl(),
			docsUrl: docsUrl()
		}),
		/* The instance knows, because the instance is what minted the key. */
		ringsOnAPhone: (ctx) => listTokens(ctx).some((t) => t.name === RINGER_TOKEN_NAME),
		/* What this deployment can do — reachable and awake, unless it is a phone. */
		capabilities,
		clientErrorReports: clientErrorState,
		setClientErrorReports: setClientErrorConsent
	});
}
