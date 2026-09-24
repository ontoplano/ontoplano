/**
 * A tool's schema is the one it actually reads.
 *
 * The published input schema is the only thing a caller has to go on, and an
 * assistant that trusts it is doing the right thing. So a tool that quietly
 * accepts an argument it never declared is worse than one that refuses it: the
 * caller reads a truncated preview, concludes the whole note is out of reach,
 * and asks the person to paste it.
 *
 * That is not hypothetical. `tasks` accepted `fields` on a build whose schema
 * never mentioned it, and a whole session was spent reading openings cut off
 * at a hundred characters while the full text was one argument away.
 *
 * The mirror of it — declaring an argument nothing reads — is the same lie
 * told the other way, and is checked here too.
 */
import { describe, expect, it } from 'vitest';
import { TOOLS } from '../src/lib/server/mcp/tools';

/** The arguments `detailOf` reads, wherever a tool calls it. */
const DETAIL = ['verbose', 'fields'];

/** What a tool's `run` is written in terms of. */
const bodyOf = (tool: (typeof TOOLS)[number]) => tool.run.toString();

/** The names a tool's schema offers. */
function declared(tool: (typeof TOOLS)[number]): string[] {
	const input = tool.input as { properties?: Record<string, unknown> };
	return Object.keys(input.properties ?? {});
}

describe('every tool', () => {
	it('declares `verbose` and `fields` where it reads them', () => {
		const quiet = TOOLS.filter((tool) => bodyOf(tool).includes('detailOf'))
			.filter((tool) => DETAIL.some((arg) => !declared(tool).includes(arg)))
			.map((tool) => tool.name);

		expect(
			quiet,
			'these call `detailOf` and do not say so in their schema — spread `DETAIL_ARGS` into `input`'
		).toEqual([]);
	});

	it('does not offer `verbose` or `fields` where nothing reads them', () => {
		const empty = TOOLS.filter((tool) => DETAIL.some((arg) => declared(tool).includes(arg)))
			.filter((tool) => !bodyOf(tool).includes('detailOf'))
			.map((tool) => tool.name);

		expect(empty, 'these offer a detail argument that nothing acts on').toEqual([]);
	});

	/*
	 * Every argument named in `refs` has to be one the tool takes. A reference
	 * declared against a name the schema does not have is resolved against
	 * nothing, which is the confinement and the ownership check both quietly
	 * not happening.
	 */
	it('takes every argument it declares a reference for', () => {
		const dangling = TOOLS.flatMap((tool) =>
			(tool.refs ?? [])
				.filter((ref) => !declared(tool).includes(ref.arg))
				.map((ref) => `${tool.name}.${ref.arg}`)
		);

		expect(dangling, 'a reference on an argument the tool does not take is not checked').toEqual(
			[]
		);
	});
});
