export type MetaKeySuggestion = {
	key: string;
	description: string;
	example: string;
	/** Which plugin reads this, when one has said so. */
	usedBy?: string;
};

/**
 * Metadata keys ontoplano suggests on its own.
 *
 * Hints, not a whitelist — any valid key is accepted, so a plugin can define
 * its own vocabulary without a change here. What a plugin declares through
 * `PUT /api/v1/plugin` is merged with these at the point of use, and carries
 * the plugin's name so the list stops looking arbitrary.
 *
 * Only genuinely generic keys belong here. Anything a specific program reads
 * should come from that program's manifest, where it can be labelled.
 */
export const SUGGESTED_KEYS: MetaKeySuggestion[] = [
	{ key: 'location', description: 'Where this happens', example: 'gym' },
	{ key: 'url', description: 'Link to open with the block', example: '' }
];

/**
 * Combine ontoplano's own suggestions with what plugins have declared.
 *
 * A plugin's description wins for a key it claims: it knows what the key does
 * to it, and a generic gloss would be less useful than "used by a-private-plugin".
 */
export function mergeSuggestions(
	declared: { name: string; metaKeys: { key: string; description: string; example: string }[] }[]
): MetaKeySuggestion[] {
	const byKey = new Map<string, MetaKeySuggestion>();
	for (const s of SUGGESTED_KEYS) byKey.set(s.key, s);

	for (const plugin of declared) {
		for (const entry of plugin.metaKeys) {
			const existing = byKey.get(entry.key);
			byKey.set(entry.key, {
				key: entry.key,
				description: entry.description || existing?.description || '',
				example: entry.example || existing?.example || '',
				// Two plugins claiming one key is real; say both rather than pick.
				usedBy: existing?.usedBy ? `${existing.usedBy}, ${plugin.name}` : plugin.name
			});
		}
	}

	return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

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
