/**
 * Arguments a tool would accept, for sweeps that change one of them.
 *
 * A sweep that points a tool at somebody else's row has to know the tool
 * refused *because of that row*. Handed only the id, a tool refuses for a
 * missing argument instead — and since the schema is checked before any
 * reference is, every such call "passed" without the reference ever being
 * looked at. So a sweep starts from a baseline the tool accepts, with each
 * reference naming the caller's own row, and substitutes one at a time.
 *
 * The sweeps check each baseline before using it: one that does not get past
 * the schema and the caller's own references is a sweep that tests nothing,
 * so they fail on it rather than skip it quietly.
 */
import type { SchemaNode } from '../../src/lib/server/mcp/arguments';

type ToolLike = { input: unknown; refs?: readonly { arg: string; kind: string }[] };

/** A value of this shape that no validator would refuse, by its name's hint. */
function sample(node: SchemaNode, name: string): unknown {
	if (node.enum) return node.enum[0];
	switch (node.type) {
		case 'integer':
		case 'number':
			return Math.max(node.minimum ?? 1, 1);
		case 'boolean':
			return false;
		case 'array':
			return [];
		case 'object':
			return {};
		default:
			if (/date|day|since|until|from|to$/i.test(name)) return '2026-03-14';
			if (/time|at$/i.test(name)) return '09:00';
			return 'x';
	}
}

const LEFT_OUT = Symbol('left out');

/**
 * The tool's required arguments, plus every reference it declares, with each
 * reference naming `rowOf(kind)`. A reference with no row is left out where
 * it is optional; null when a required one has none.
 */
export function baselineArgs(
	tool: ToolLike,
	rowOf: (kind: string) => number | string | undefined
): Record<string, unknown> | null {
	const refs = new Map((tool.refs ?? []).map((ref) => [ref.arg, ref.kind]));
	let missing = false;

	const build = (node: SchemaNode, path: string, name: string): unknown => {
		const kind = refs.get(path);
		if (kind !== undefined) {
			const row = rowOf(kind);
			if (row === undefined) return LEFT_OUT;
			return node.type === 'array' ? [row] : row;
		}
		const under = (prefix: string) =>
			[...refs.keys()].some((arg) => arg === prefix || arg.startsWith(`${prefix}.`));

		if (node.type === 'object' && node.properties) {
			const required = new Set(node.required ?? []);
			const out: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(node.properties)) {
				const at = path ? `${path}.${key}` : key;
				if (!required.has(key) && !under(at) && !under(`${at}[]`)) continue;
				const value = build(child, at, key);
				if (value !== LEFT_OUT) out[key] = value;
				else if (required.has(key)) missing = true;
			}
			return out;
		}
		if (node.type === 'array' && node.items && under(`${path}[]`)) {
			const one = build(node.items, `${path}[]`, name);
			return one === LEFT_OUT ? [] : [one];
		}
		return sample(node, name);
	};

	const args = build(tool.input as SchemaNode, '', '') as Record<string, unknown>;
	return missing ? null : args;
}

/**
 * A copy of `args` with the reference at `path` replaced by `value` — every
 * place the path reaches, so `targets[].goalId` changes in each target, and a
 * list of ids becomes a list of that one.
 */
export function withRef(
	tool: ToolLike,
	args: Record<string, unknown>,
	path: string,
	value: unknown
): Record<string, unknown> {
	const copy = structuredClone(args);
	const steps = path.split('.');

	let node: SchemaNode | undefined = tool.input as SchemaNode;
	for (const step of steps) {
		node = node?.properties?.[step.replace(/\[\]$/, '')];
		if (step.endsWith('[]')) node = node?.items;
	}
	const many = node?.type === 'array';

	let here: Record<string, unknown>[] = [copy];
	steps.forEach((step, i) => {
		const key = step.replace(/\[\]$/, '');
		if (i === steps.length - 1) {
			for (const one of here) one[key] = many ? [value] : value;
			return;
		}
		here = here.flatMap((one) => {
			const next = one[key];
			return step.endsWith('[]')
				? ((next as Record<string, unknown>[]) ?? [])
				: [next as Record<string, unknown>];
		});
	});
	return copy;
}
