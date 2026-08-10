/**
 * Metadata key suggestions, shared by client and server.
 *
 * Lives outside `$lib/server` because the editor UI needs it. The server-side
 * validation and storage rules are in `$lib/server/services/meta.ts`.
 *
 * These are hints, not a whitelist — any valid key is accepted, so a plugin can
 * define its own vocabulary without a change here.
 */
export const SUGGESTED_KEYS: { key: string; description: string; example: string }[] = [
	{ key: 'alarm', description: 'Ring an alarm for this block', example: 'true' },
	{ key: 'remind_min', description: 'Notify N minutes beforehand', example: '5' },
	{ key: 'hard', description: 'Alarm that resists being dismissed', example: 'true' },
	{ key: 'location', description: 'Where this happens', example: 'gym' },
	{ key: 'url', description: 'Link to open with the block', example: '' }
];

/** Parse a stored meta JSON string into a flat object, tolerating bad input. */
export function parseSlotMeta(raw: string | null | undefined): Record<string, string> {
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
				out[k] = String(v);
		}
		return out;
	} catch {
		return {};
	}
}
