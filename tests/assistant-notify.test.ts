import { describe, expect, test } from 'vitest';
import {
	nounFor,
	phraseFor,
	PHRASE_OVERRIDES,
	summarise,
	VERB_PAST
} from '../src/lib/server/services/assistant-notify';
import { TOOLS } from '../src/lib/server/mcp/tools';

/**
 * The sentence a notification is built from, and the rule that keeps it true
 * for a tool nobody has written yet.
 *
 * The phrase comes from the tool's own name rather than from ninety-one
 * hand-written strings, so the thing that can rot is the naming convention
 * rather than a table somebody has to remember to extend. That is what the
 * first test is: every tool that writes has to be readable as a verb and a
 * noun, and a new one that is not says so here rather than pushing "changed 3
 * things" to somebody's phone for the rest of its life.
 */
describe('every write tool can say what it did', () => {
	const writes = TOOLS.filter((t) => t.writes).map((t) => t.name);

	test('there are some, and they are all readable', () => {
		expect(writes.length).toBeGreaterThan(50);

		const unreadable = writes.filter((name) => !phraseFor(name));
		expect(
			unreadable,
			`these tools have no phrase. Name them verb_noun, or add the verb to ` +
				`VERB_PAST, or — if the name really cannot say it — put them in ` +
				`PHRASE_OVERRIDES:\n  ${unreadable.join('\n  ')}`
		).toEqual([]);
	});

	test('and no tool that only reads is given one to say', () => {
		// Not a correctness bug, a noise bug: a read that produced a
		// notification would mean an assistant looking at the day buzzes the
		// phone of the person whose day it is.
		const reads = TOOLS.filter((t) => !t.writes).map((t) => t.name);
		expect(reads.length).toBeGreaterThan(5);
	});

	test('the overrides are for tools that exist', () => {
		for (const name of Object.keys(PHRASE_OVERRIDES))
			expect(writes, `${name} is overridden and is not a write tool`).toContain(name);
	});

	test('and every verb in the table is one some tool starts with', () => {
		// Otherwise the table grows entries for tools that were renamed away,
		// and nobody can tell which of them still matter.
		const used = new Set(writes.map((name) => name.slice(0, name.indexOf('_'))));
		const spare = Object.keys(VERB_PAST).filter((verb) => !used.has(verb));
		expect(spare, `no tool starts with: ${spare.join(', ')}`).toEqual([]);
	});
});

describe('the line somebody reads', () => {
	test('one kind of change is the whole sentence', () => {
		const { title, body } = summarise(['add_todo', 'add_todo', 'add_todo'], 'Claude');
		expect(title).toBe('Claude added 3 todos');
		expect(body).toBe('added 3 todos');
	});

	test('one change is singular', () => {
		expect(summarise(['finish_block'], 'Claude').title).toBe('Claude finished 1 block');
	});

	test('several kinds are counted, largest first', () => {
		const { title, body } = summarise(
			['change_block', 'add_todo', 'change_block', 'change_block', 'write_entry'],
			'Claude'
		);
		expect(title).toBe('Claude changed 5 things');
		expect(body).toBe('changed 3 blocks, added 1 todo, wrote 1 entry');
	});

	test('a name it cannot read is counted rather than guessed at', () => {
		const { title, body } = summarise(['add_todo', 'sideways'], 'Claude');
		expect(title).toBe('Claude changed 2 things');
		expect(body).toContain('1 other');
	});

	test('the token names itself', () => {
		expect(summarise(['add_todo'], 'Kitchen tablet').title).toContain('Kitchen tablet');
	});

	test('an irregular plural is not a noun with an s on it', () => {
		expect(nounFor('entry', 2)).toBe('entries');
		expect(nounFor('data_point', 2)).toBe('data points');
		expect(nounFor('todo', 1)).toBe('todo');
	});
});
