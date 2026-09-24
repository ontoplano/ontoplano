/**
 * The two pieces of the tools page that turn source text into Markdown.
 *
 * Their own file so they can be tested: `build-docs.mjs` is a script, and
 * importing it would write the whole docs tree.
 */
import ts from 'typescript';

/** Every `const NAME = '…'` at the top of a file, so a template can say it. */
const constantsOf = new WeakMap();

function stringConstants(source) {
	let found = constantsOf.get(source);
	if (found) return found;
	found = new Map();
	for (const st of source.statements) {
		if (!ts.isVariableStatement(st)) continue;
		for (const decl of st.declarationList.declarations) {
			const value = decl.initializer;
			if (!value || !ts.isIdentifier(decl.name)) continue;
			if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
				found.set(decl.name.text, value.text);
		}
	}
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

/** One parameter as a row of the tools page's table. */
export function paramRow(p) {
	const bits = [p.description];
	if (p.enum) bits.push(`One of: ${p.enum.map((v) => `\`${v}\``).join(', ')}.`);
	if (p.fields) bits.push(`Each one carries ${p.fields.map((f) => `\`${f}\``).join(', ')}.`);
	if (p.default !== undefined) bits.push(`Default \`${p.default}\`.`);
	if (p.deprecated) bits.push('**Deprecated.**');
	const said = bits.filter(Boolean).join(' ').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
	return `| \`${p.name}\` | ${p.type} | ${p.required ? 'yes' : '—'} | ${said} |`;
}
