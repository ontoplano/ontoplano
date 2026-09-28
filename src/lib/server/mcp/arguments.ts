/**
 * A tool's arguments, checked against the schema it advertises.
 *
 * Every tool publishes an `inputSchema` with `additionalProperties: false`,
 * and until this ran nothing held a call to it: a misspelt argument was
 * dropped without a word, a string arrived where a service expected a
 * number, and a list of forty thousand ids was resolved one at a time. The
 * schema is the contract a client was shown, so it is the one checked —
 * before the confinement, the references, the call budget or any service
 * sees the call.
 *
 * Only the part of JSON Schema the tools actually use: `type` (one name),
 * `enum`, `properties`, `required`, `additionalProperties` (false or a
 * schema), `items`, `minimum`, `maximum` and `maxItems`. A keyword outside
 * that list is not silently skipped — `tests/mcp-arguments.test.ts` walks
 * every schema and fails on one, so a tool cannot advertise a rule this
 * does not hold.
 *
 * Two leniences, both part of the published surface rather than exceptions
 * to it:
 *
 * - **`null` for an argument that is not required** reads as not given. The
 *   descriptions promise it — "`null` clears it", "`0` or `null` moves it to
 *   the top level" — and the tools already read it that way.
 * - **A deprecated argument** is checked by name and not by shape. It is the
 *   old surface, still accepted so a caller written against it keeps working
 *   until the release that removes it, and it was accepted loosely — `meta`
 *   took a JSON string as readily as an object. The tool reading it still
 *   refuses what it cannot use.
 * - **A list of words may come as one string of them.** `tags` says so in
 *   its description — "a single string of them, separated by commas or
 *   spaces, is understood too" — because assistants send both. It holds for
 *   any list whose items are strings, so a tool taking one reads it with the
 *   same parser `tags` does.
 */

/** A schema node, the subset above. */
export type SchemaNode = {
	type?: string;
	enum?: readonly unknown[];
	properties?: Record<string, SchemaNode>;
	required?: readonly string[];
	additionalProperties?: boolean | SchemaNode;
	items?: SchemaNode;
	minimum?: number;
	maximum?: number;
	maxItems?: number;
	deprecated?: boolean;
};

/** The keywords this checks, and the ones that only describe. */
export const CHECKED_KEYWORDS = [
	'type',
	'enum',
	'properties',
	'required',
	'additionalProperties',
	'items',
	'minimum',
	'maximum',
	'maxItems'
] as const;
export const DESCRIPTIVE_KEYWORDS = ['description', 'default', 'deprecated', 'title'] as const;

/**
 * How many elements any list argument may carry, where its schema names no
 * smaller ceiling.
 *
 * Every element of a list of ids is a reference resolved before the tool
 * runs, and a list is where one request becomes a thousand lookups. The
 * largest honest list a tool takes is a page of tasks, which is 200.
 */
export const MAX_ARGUMENT_ITEMS = 500;

/** Why an argument was refused, in words that do not change between releases. */
export type ArgumentProblem = {
	/** Where: `id`, `ranOutOf[1]`, `targets[0].unit`. */
	argument: string;
	problem: 'unknown' | 'missing' | 'type' | 'enum' | 'range' | 'too_many';
	/** What was wanted: a type name, the enum's values, the bounds, the ceiling. */
	expected?: unknown;
};

const TYPES: Record<string, (value: unknown) => boolean> = {
	string: (v) => typeof v === 'string',
	integer: (v) => typeof v === 'number' && Number.isInteger(v),
	number: (v) => typeof v === 'number' && Number.isFinite(v),
	boolean: (v) => typeof v === 'boolean',
	array: (v) => Array.isArray(v),
	object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
};

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function check(node: SchemaNode, value: unknown, path: string): ArgumentProblem | null {
	if (node.type === 'array' && node.items?.type === 'string' && typeof value === 'string')
		return null;

	if (node.type !== undefined) {
		const is = TYPES[node.type];
		// A type this does not know is a schema bug, and a bug here refuses
		// rather than lets anything through.
		if (!is || !is(value)) return { argument: path, problem: 'type', expected: node.type };
	}

	if (node.enum && !node.enum.includes(value))
		return { argument: path, problem: 'enum', expected: [...node.enum] };

	if (typeof value === 'number') {
		if (
			(node.minimum !== undefined && value < node.minimum) ||
			(node.maximum !== undefined && value > node.maximum)
		)
			return {
				argument: path,
				problem: 'range',
				expected: { minimum: node.minimum, maximum: node.maximum }
			};
	}

	if (Array.isArray(value)) {
		const ceiling = Math.min(node.maxItems ?? MAX_ARGUMENT_ITEMS, MAX_ARGUMENT_ITEMS);
		if (value.length > ceiling) return { argument: path, problem: 'too_many', expected: ceiling };
		if (node.items)
			for (let i = 0; i < value.length; i++) {
				const found = check(node.items, value[i], `${path}[${i}]`);
				if (found) return found;
			}
	}

	if (TYPES.object(value) && (node.properties || node.additionalProperties !== undefined))
		return checkObject(node, value as Record<string, unknown>, path);

	return null;
}

function checkObject(
	node: SchemaNode,
	value: Record<string, unknown>,
	path: string
): ArgumentProblem | null {
	const properties = node.properties ?? {};
	const required = new Set(node.required ?? []);

	for (const name of required)
		if (value[name] === undefined || value[name] === null)
			return { argument: join(path, name), problem: 'missing' };

	for (const [name, given] of Object.entries(value)) {
		const at = join(path, name);
		const known = Object.hasOwn(properties, name) ? properties[name] : undefined;
		if (!known) {
			if (node.additionalProperties === false) return { argument: at, problem: 'unknown' };
			if (typeof node.additionalProperties === 'object') {
				const found = check(node.additionalProperties, given, at);
				if (found) return found;
			}
			continue;
		}
		if (given === undefined || (given === null && !required.has(name))) continue;
		if (known.deprecated) continue;
		const found = check(known, given, at);
		if (found) return found;
	}
	return null;
}

/**
 * The first thing wrong with these arguments, or null when there is nothing.
 *
 * The first rather than all of them: the answer is read by a model that will
 * fix one and try again, and a list of every consequence of one wrong
 * nesting is noise.
 */
export function argumentProblem(schema: object, args: unknown): ArgumentProblem | null {
	return check(schema as SchemaNode, args, '');
}

/** The problem as a sentence, naming the argument. */
export function describeProblem({ argument, problem, expected }: ArgumentProblem): string {
	const name = `\`${argument || 'arguments'}\``;
	switch (problem) {
		case 'unknown':
			return `${name} is not an argument this tool takes.`;
		case 'missing':
			return `${name} is required.`;
		case 'type':
			return `${name} has to be ${expected === 'integer' || expected === 'array' || expected === 'object' ? 'an' : 'a'} ${String(expected)}.`;
		case 'enum':
			return `${name} has to be one of: ${(expected as unknown[]).map((v) => `\`${String(v)}\``).join(', ')}.`;
		case 'range': {
			const { minimum, maximum } = expected as { minimum?: number; maximum?: number };
			if (minimum !== undefined && maximum !== undefined)
				return `${name} has to be between ${minimum} and ${maximum}.`;
			return minimum !== undefined
				? `${name} has to be at least ${minimum}.`
				: `${name} has to be at most ${maximum}.`;
		}
		case 'too_many':
			return `${name} may hold at most ${String(expected)} items.`;
	}
}
