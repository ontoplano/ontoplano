/**
 * One legible line per assistant call: whatever names the thing best, from
 * the state it replaced or the arguments — never the raw JSON.
 *
 * Shared by the two screens that list what an assistant did, the integrations
 * page and a connection's own, so the line reads the same on both.
 */
export function callLine(one: {
	args: Record<string, unknown>;
	before: unknown;
	destroyed: boolean;
}): string {
	const from = { ...(one.args ?? {}), ...((one.before as Record<string, unknown>) ?? {}) };
	const said = [from.title, from.name, from.label, from.content, from.message].find(
		(v) => typeof v === 'string' && v.trim()
	);
	return typeof said === 'string' ? said.slice(0, 80) : '';
}
