/**
 * The bearer of a file request, when it is a key rather than a browser.
 *
 * The rule itself — which grant reaches which file — is
 * `$lib/services/media-permission`, so the MCP tool table can ask the same
 * question without importing the token service through it.
 */
import type { FileCaller } from '$lib/services/host';
import type { Referrer } from '$lib/services/media-referrers';
import { mayReadFile } from '$lib/services/media-permission';
import { authenticateToken } from '../services/tokens';
import { spendCallBudget, assertNoPaymentHold } from './auth';

export function fileCaller(request: Request): FileCaller | null {
	const header = request.headers.get('authorization') ?? '';
	if (!header.toLowerCase().startsWith('bearer ')) return null;

	const token = authenticateToken(header.slice(7).trim(), new Date());
	assertNoPaymentHold(token.userId);
	// Reading a file is a call like any other. Without this a key would have an
	// endpoint it could pull on for ever for nothing.
	spendCallBudget(token.tokenId, token.userId, false);

	return {
		userId: token.userId,
		mayRead(referrers: Referrer[]) {
			return mayReadFile(referrers, token.scopes, token.confinement);
		}
	};
}
