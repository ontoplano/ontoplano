import type { RequestHandler } from './$types';

import { authenticateApi } from '$lib/server/api/auth';
import { toJsonError } from '$lib/http-errors';
import { listLedgers } from '$lib/services/ledgers';

/**
 * Ledgers and their evidence status, for a script.
 *
 * The same rows the Ledgers screen draws, including archived ones — with
 * `supportedMinor` null when no opening was declared, so a caller reads a gap
 * rather than a number it can add up. `balanceCents` is left out: it is a
 * recorded subtotal kept for old UI consumers, and a script reading a field
 * with "balance" in its name is exactly the misreading this release removes.
 * Read-only: writing stays with the app and the assistant in this release.
 */
export const GET: RequestHandler = async (event) => {
	try {
		const { ctx } = authenticateApi(event, 'statements:read');
		const asOf = event.url.searchParams.get('as_of') ?? undefined;
		const ledgers = listLedgers(ctx, { includeArchived: true, asOf }).map(
			({ balanceCents, ...ledger }) => {
				void balanceCents;
				return ledger;
			}
		);
		return Response.json({ ledgers });
	} catch (e) {
		return toJsonError(e);
	}
};
