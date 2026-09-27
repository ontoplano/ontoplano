/**
 * The pieces of the tools page that turn source text and the manifest into
 * Markdown.
 *
 * Their own file so they can be tested: `build-docs.mjs` is a script, and
 * importing it would write the whole docs tree.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Every `const NAME = '…'` (or a number) at the top of a file, so a template
 * can say it — and every one it imports by name from another file in this
 * repository, so `removed in ${META_REMOVED_IN}` says the release even though
 * the constant lives beside the attributes rather than beside the tool.
 */
/** @type {WeakMap<import('typescript').SourceFile, Map<string, string>>} */
const constantsOf = new WeakMap();

/** @param {string} file */
function ownConstants(file) {
	if (!existsSync(file)) return new Map();
	const source = ts.createSourceFile(
		file,
		readFileSync(file, 'utf8'),
		ts.ScriptTarget.Latest,
		true
	);
	return declaredIn(source);
}

/** @param {import('typescript').SourceFile} source */
function declaredIn(source) {
	const found = new Map();
	for (const st of source.statements) {
		if (!ts.isVariableStatement(st)) continue;
		for (const decl of st.declarationList.declarations) {
			const value = decl.initializer;
			if (!value || !ts.isIdentifier(decl.name)) continue;
			if (
				ts.isStringLiteral(value) ||
				ts.isNoSubstitutionTemplateLiteral(value) ||
				ts.isNumericLiteral(value)
			)
				found.set(decl.name.text, value.text);
		}
	}
	return found;
}

/**
 * The file an import names, when it is one of this repository's own.
 *
 * @param {string} from
 * @param {string} specifier
 */
function importedFile(from, specifier) {
	const path = specifier.startsWith('$lib/')
		? join(ROOT, 'src/lib', specifier.slice('$lib/'.length))
		: specifier.startsWith('.')
			? join(dirname(from), specifier)
			: null;
	return path ? path.replace(/\.js$/, '.ts') : null;
}

/** @param {import('typescript').SourceFile} source */
function stringConstants(source) {
	let found = constantsOf.get(source);
	if (found) return found;
	found = new Map();
	for (const st of source.statements) {
		if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
		const bindings = st.importClause?.namedBindings;
		if (!bindings || !ts.isNamedImports(bindings)) continue;
		const file = importedFile(source.fileName, st.moduleSpecifier.text);
		if (!file) continue;
		const there = ownConstants(file);
		for (const one of bindings.elements) {
			const value = there.get((one.propertyName ?? one.name).text);
			if (value !== undefined) found.set(one.name.text, value);
		}
	}
	for (const [name, value] of declaredIn(source)) found.set(name, value);
	constantsOf.set(source, found);
	return found;
}

/**
 * The text of a string literal or a template, as the running code would say it.
 *
 * A template is read through its cooked parts, so an escaped backtick is a
 * backtick rather than a backslash and one. A substitution naming a string
 * constant in the same file — `removed in ${ENERGY_REMOVED_IN}` — is replaced
 * by its value; anything else, which only the running code knows, by `…`.
 *
 * @param {import('typescript').Node | undefined} node
 * @param {import('typescript').SourceFile} source
 * @returns {string}
 */
export function literalText(node, source) {
	if (!node) return '';
	if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
	if (ts.isTemplateExpression(node)) {
		const constants = stringConstants(source);
		let out = node.head.text;
		for (const span of node.templateSpans) {
			const said = span.expression;
			out += (ts.isIdentifier(said) && constants.get(said.text)) || '…';
			out += span.literal.text;
		}
		return out;
	}
	return '';
}

const code = (/** @type {unknown} */ value) =>
	`\`${typeof value === 'string' ? value : JSON.stringify(value)}\``;

/**
 * What a schema node's type reads as: `integer[]` for a list of integers.
 *
 * @param {any} spec
 * @returns {string}
 */
function typeOf(spec) {
	return spec.type === 'array' && spec.items ? `${spec.items.type}[]` : spec.type;
}

/**
 * The bounds a node declares, as a sentence, or nothing.
 *
 * @param {any} spec
 */
function boundsOf(spec) {
	const { minimum: min, maximum: max } = spec;
	const bits = [];
	if (min !== undefined && max !== undefined) bits.push(`From ${min} to ${max}.`);
	else if (min !== undefined) bits.push(`At least ${min}.`);
	else if (max !== undefined) bits.push(`At most ${max}.`);
	if (spec.maxItems !== undefined) bits.push(`At most ${spec.maxItems} items.`);
	return bits;
}

/**
 * The names a schema holds, in the order the source writes them — which puts
 * `id` first and keeps related arguments together — and then any the source
 * text could not be read for, so each still gets a row from the manifest.
 *
 * @param {Record<string, unknown>} fields
 * @param {Record<string, unknown>} [words]
 */
function inSourceOrder(fields, words = {}) {
	return [
		...Object.keys(words).filter((name) => fields[name]),
		...Object.keys(fields).filter((name) => !words[name])
	];
}

/**
 * One parameter as rows of the tools page's table: its own, then one per
 * field inside it — `targets[].unit` for a field of each element of a list,
 * `where.city` for a field of an object.
 *
 * @param {string} path  the name as a caller writes it
 * @param {any} spec     the node from `manifest.json`
 * @param {any} words    what the source says about it: description, enum order, nested words
 * @returns {string[]}
 */
export function paramRows(path, spec, words = {}) {
	const bits = [words.description];
	if (spec.enum) {
		// The order the source writes them in, which usually means something —
		// `todo`, `doing`, `done` — unless it names a different set.
		const ordered =
			words.enum &&
			words.enum.length === spec.enum.length &&
			spec.enum.every((/** @type {string} */ one) => words.enum.includes(one))
				? words.enum
				: spec.enum;
		bits.push(`One of: ${ordered.map(code).join(', ')}.`);
	}
	bits.push(...boundsOf(spec));
	if (typeof spec.additionalProperties === 'object')
		bits.push(`Any key, each holding a ${typeOf(spec.additionalProperties)}.`);
	if (spec.default !== undefined) bits.push(`Default ${code(spec.default)}.`);
	if (spec.deprecated)
		bits.push(
			spec.removedIn ? `**Deprecated** — removed in ${spec.removedIn}.` : '**Deprecated.**'
		);
	const said = bits.filter(Boolean).join(' ').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
	const rows = [`| \`${path}\` | ${typeOf(spec)} | ${spec.required ? 'yes' : '—'} | ${said} |`];

	const inner = spec.items?.properties
		? { at: `${path}[]`, fields: spec.items.properties, words: words.items?.properties ?? {} }
		: spec.properties
			? { at: path, fields: spec.properties, words: words.properties ?? {} }
			: null;
	if (inner)
		for (const name of inSourceOrder(inner.fields, inner.words))
			rows.push(...paramRows(`${inner.at}.${name}`, inner.fields[name], inner.words[name]));
	return rows;
}

/**
 * What a tool needs, and what it answers — the line under its description.
 *
 * @param {any} t  a tool's manifest entry
 */
export function needsLine(t) {
	const grant = t.anyScope
		? `any of ${t.anyScope.map(code).join(', ')}`
		: [t.scope, t.alsoNeeds, t.destroys ? 'destructive' : null]
				.filter(Boolean)
				.map(code)
				.join(' and ');
	const does = t.destroys ? 'deletes' : t.writes ? 'writes' : 'read-only';
	const answers = [];
	if (t.pages) answers.push('answers a page');
	if (t.writes)
		answers.push(
			t.quiet
				? 'answers without `before` and `after`'
				: t.creates
					? `answers with \`before\` and \`after\`, \`after\` being the new ${t.creates}`
					: 'answers with `before` and `after`'
		);
	if (t.deprecated)
		answers.push(`**deprecated**${t.removedIn ? `, removed in ${t.removedIn}` : ''}`);
	return `_Needs ${grant}; ${[does, ...answers].join('; ')}._`;
}

/**
 * One tool's section of the page.
 *
 * @param {any} t  the manifest entry, with `name`, `title`, `description` and
 *                 `words` (the source's words for each parameter) beside it
 */
export function mcpToolSection(t) {
	const names = inSourceOrder(t.params, t.words);
	const table =
		names.length > 0
			? [
					'',
					'| Parameter | Type | Required | What it is |',
					'| --- | --- | --- | --- |',
					...names.flatMap((name) => paramRows(name, t.params[name], t.words?.[name]))
				].join('\n')
			: '\n_Takes no parameters._';
	return `### \`${t.name}\` — ${t.title}\n\n${t.description}\n\n${needsLine(t)}\n${table}`;
}

/**
 * JSON as a person would write it in a message: an object or list on one
 * line while it fits, spread over lines when it does not.
 *
 * @param {unknown} value
 * @param {string} [indent]
 * @param {number} [width]
 * @returns {string}
 */
export function compactJson(value, indent = '', width = 80) {
	const flat = oneLine(value);
	if (indent.length + flat.length <= width || value === null || typeof value !== 'object')
		return flat;
	const inner = indent + '\t';
	const entries = Array.isArray(value)
		? value.map((one) => inner + compactJson(one, inner, width))
		: Object.entries(value).map(
				([key, one]) => `${inner}${JSON.stringify(key)}: ${compactJson(one, inner, width)}`
			);
	const [open, close] = Array.isArray(value) ? ['[', ']'] : ['{', '}'];
	return `${open}\n${entries.join(',\n')}\n${indent}${close}`;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function oneLine(value) {
	if (Array.isArray(value)) return `[${value.map(oneLine).join(', ')}]`;
	if (value !== null && typeof value === 'object') {
		const entries = Object.entries(value);
		if (entries.length === 0) return '{}';
		return `{ ${entries.map(([key, one]) => `${JSON.stringify(key)}: ${oneLine(one)}`).join(', ')} }`;
	}
	return JSON.stringify(value);
}

/**
 * The worked examples, as a page section: what somebody asks, the call it
 * becomes, and the part of the answer worth reading. `tests/mcp-examples.test.ts`
 * makes every one of these calls against a real database, in this order, and
 * checks the answer holds what is printed here.
 *
 * @param {{ ask: string, tool: string, arguments: object, answer?: object, refused?: string, note?: string }[]} examples
 */
export function mcpExamples(examples) {
	const json = compactJson;
	return examples
		.map((one) => {
			const parts = [
				`**“${one.ask}”**`,
				'```json\n' + json({ name: one.tool, arguments: one.arguments }) + '\n```'
			];
			if (one.refused)
				parts.push(
					`Refused before the tool runs, as a JSON-RPC error \`-32602\` with the message “${one.refused}”`
				);
			if (one.answer)
				parts.push('The answer holds, among the rest:', '```json\n' + json(one.answer) + '\n```');
			if (one.note) parts.push(one.note);
			return parts.join('\n\n');
		})
		.join('\n\n');
}

/**
 * The capability matrix: each room, and which of the common verbs an
 * assistant has over MCP beside what the app has.
 *
 * The placing of tools comes from `capabilities.json`, and a tool it names
 * that the manifest has not got stops the build — so the table cannot name
 * a tool the server does not serve. `tests/mcp-capabilities.test.ts` holds
 * the rest: every tool placed, every verb agreeing with its manifest entry,
 * every app action where it says, and every gap explained.
 *
 * @typedef {{ name: string, mcp: Record<string, string[]>, app: Record<string, string[]>, missing?: Record<string, string>, withheld?: Record<string, string> }} CapabilityRoom
 * @param {{ verbs: string[], domains: CapabilityRoom[] }} capabilities
 * @param {Record<string, unknown>} manifest
 */
export function mcpCapabilities(capabilities, manifest) {
	const { verbs, domains } = capabilities;
	const unknown = domains.flatMap((d) =>
		Object.values(d.mcp)
			.flat()
			.filter((tool) => !manifest[tool])
	);
	if (unknown.length > 0)
		throw new Error(
			`capabilities.json names tools the manifest has not got: ${unknown.join(', ')}`
		);

	/** @param {CapabilityRoom} d @param {string} verb */
	const cell = (d, verb) => {
		const tools = d.mcp[verb] ?? [];
		const inApp = (d.app[verb] ?? []).length > 0;
		if (tools.length > 0) {
			const named = tools.map((/** @type {string} */ tool) => `\`${tool}\``).join(', ');
			const notes = [!inApp && 'MCP only', d.missing?.[verb] && 'in part'].filter(Boolean);
			return notes.length ? `${named} _(${notes.join(', ')})_` : named;
		}
		if (!inApp) return '';
		return d.withheld?.[verb] ? '_app only, on purpose_' : '**app only**';
	};

	const table = [
		`| Room | ${verbs.join(' | ')} |`,
		`| --- | ${verbs.map(() => '---').join(' | ')} |`,
		...domains.map((d) => `| ${d.name} | ${verbs.map((verb) => cell(d, verb)).join(' | ')} |`)
	].join('\n');

	/** @param {'missing' | 'withheld'} key */
	const listed = (key) =>
		domains
			.flatMap((d) =>
				verbs
					.filter((verb) => d[key]?.[verb])
					.map((verb) => `- **${d.name}, ${verb}.** ${d[key]?.[verb]}`)
			)
			.join('\n');

	return [
		table,
		'**Not there yet** — what the app does and an assistant cannot:',
		listed('missing'),
		'**Left out on purpose:**',
		listed('withheld')
	].join('\n\n');
}
