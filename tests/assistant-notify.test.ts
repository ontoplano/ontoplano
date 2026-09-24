import { beforeAll, describe, expect, it, test } from 'vitest';
import {
	ASSISTANT_LOG_PATH,
	nounKey,
	NOUN_KEYS,
	phraseFor,
	PHRASE_OVERRIDES,
	subjectName,
	SUBJECT_MAX,
	summarise,
	VERB_KEYS
} from '../src/lib/server/services/assistant-notify';
import { TOOLS } from '../src/lib/server/mcp/tools';
import { translatorFor, type Translate } from '../src/lib/i18n/core';

/* The sentence is built in the reader's language now, so every test needs one. */
let en: Translate;
let pt: Translate;
beforeAll(async () => {
	en = await translatorFor('en');
	pt = await translatorFor('pt-BR');
});

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

	test('every noun a write tool produces has been written in the catalogue', () => {
		// `yarn messages --check` cannot catch this: the key is assembled at
		// run time, so a tool added without its noun would render as words on
		// somebody's phone rather than as a sentence.
		const missing = [
			...new Set(
				writes
					.map((name) => phraseFor(name))
					.filter((p) => p !== null)
					.map((p) => nounKey(p.noun))
			)
		].filter((key) => !NOUN_KEYS.has(key));
		expect(
			missing,
			`these nouns have no notify.noun.* message:\n  ${missing.join('\n  ')}`
		).toEqual([]);
	});

	test('the overrides are for tools that exist', () => {
		for (const name of Object.keys(PHRASE_OVERRIDES))
			expect(writes, `${name} is overridden and is not a write tool`).toContain(name);
	});

	test('and every verb in the table is one some tool starts with', () => {
		// Otherwise the table grows entries for tools that were renamed away,
		// and nobody can tell which of them still matter.
		const used = new Set(writes.map((name) => name.slice(0, name.indexOf('_'))));
		const spare = [...VERB_KEYS].filter((verb) => !used.has(verb));
		expect(spare, `no tool starts with: ${spare.join(', ')}`).toEqual([]);
	});
});

describe('the line somebody reads', () => {
	test('one kind of change is the whole sentence', () => {
		const { title, body } = summarise(['add_task', 'add_task', 'add_task'], 'Claude', en);
		expect(title).toBe('Claude added 3 tasks');
		expect(body).toBe('added 3 tasks');
	});

	test('one change is singular', () => {
		expect(summarise(['finish_block'], 'Claude', en).title).toBe('Claude finished 1 block');
	});

	test('several kinds are counted, largest first', () => {
		const { title, body } = summarise(
			['change_block', 'add_task', 'change_block', 'change_block', 'write_entry'],
			'Claude',
			en
		);
		expect(title).toBe('Claude changed 5 things');
		expect(body).toBe('changed 3 blocks, added 1 task, wrote 1 entry');
	});

	test('a name it cannot read is counted rather than guessed at', () => {
		const { title, body } = summarise(['add_task', 'sideways'], 'Claude', en);
		expect(title).toBe('Claude changed 2 things');
		expect(body).toContain('1 other');
	});

	test('the token names itself', () => {
		expect(summarise(['add_task'], 'Kitchen tablet', en).title).toContain('Kitchen tablet');
	});

	test('an irregular plural is not a noun with an s on it', () => {
		expect(summarise(['write_entry', 'write_entry'], 'Claude', en).body).toBe('wrote 2 entries');
		expect(summarise(['add_data_point', 'add_data_point'], 'Claude', en).body).toBe(
			'added 2 data points'
		);
		expect(summarise(['add_task'], 'Claude', en).body).toBe('added 1 task');
	});

	/*
	 * The thing this was reported for: the panel's own title was translated
	 * and every line under it was English, because the sentence was assembled
	 * from identifiers rather than from the catalogue.
	 */
	test("it is written in the language the account reads, not the caller's", () => {
		const { title, body } = summarise(['add_task', 'add_task'], 'Claude', pt);
		expect(title).toBe('Claude adicionou 2 tarefas');
		expect(body).toBe('adicionou 2 tarefas');

		const many = summarise(['add_task', 'write_entry'], 'Claude', pt);
		expect(many.title).toBe('Claude alterou 2 coisas');
		expect(many.body).toBe('adicionou 1 tarefa, escreveu 1 entrada');
	});

	/*
	 * "labelled 1 todo" told you the shape of what happened and nothing about
	 * your afternoon: you have one task in mind and the line would not say
	 * whether it was that one. A count is the honest answer for a burst, where
	 * there is no single thing to name.
	 */
	test('a single write names the thing it was about', () => {
		const { title, body } = summarise(
			[
				{
					tool: 'tag_task',
					args: { id: 7, add: 'done-by-ai' },
					before: { title: 'bad filter button' }
				}
			],
			'Claude',
			en
		);
		expect(title).toBe('Claude labelled \u201cbad filter button\u201d');
		expect(body).toBe('as done-by-ai');
	});

	test('and says which labels came off', () => {
		const { body } = summarise(
			[
				{
					tool: 'tag_task',
					args: { id: 7, add: 'reviewed-by-ai', remove: 'ai-review' },
					before: { title: 'bad filter button' }
				}
			],
			'Claude',
			en
		);
		expect(body).toBe('as reviewed-by-ai, ai-review taken off');
	});

	test('a create has no before, so the name comes from what was sent', () => {
		const { title, body } = summarise(
			[{ tool: 'add_task', args: { title: 'Buy milk' } }],
			'Claude',
			en
		);
		expect(title).toBe('Claude added \u201cBuy milk\u201d');
		// No labels to say, so the kind of thing is still worth carrying.
		expect(body).toBe('added 1 task');
	});

	test('two writes are counted, named or not', () => {
		const { title } = summarise(
			[
				{ tool: 'tag_task', args: { id: 7 }, before: { title: 'bad filter button' } },
				{ tool: 'tag_task', args: { id: 8 }, before: { title: 'filter header bar' } }
			],
			'Claude',
			en
		);
		expect(title).toBe('Claude labelled 2 tasks');
	});

	test('a write about something nameless is counted, not invented', () => {
		const { title } = summarise(
			[{ tool: 'change_reminder', args: { id: 3, at: '2026-09-23T10:00:00Z' } }],
			'Claude',
			en
		);
		expect(title).toBe('Claude changed 1 reminder');
	});

	test('the name a rename replaced is the one announced', () => {
		// Otherwise the notification reports the new name as though you had
		// already known it, which is the one thing you did not.
		const { title } = summarise(
			[{ tool: 'rename_tag', args: { name: 'chores' }, before: { name: 'errands' } }],
			'Claude',
			en
		);
		expect(title).toContain('errands');
	});

	test('a title longer than a lock screen is cut, not sent whole', () => {
		const long = 'x'.repeat(SUBJECT_MAX * 2);
		const named = subjectName({ tool: 'change_task', before: { title: long } });
		expect(named).toHaveLength(SUBJECT_MAX);
		expect(named?.endsWith('\u2026')).toBe(true);
	});

	test('a noun the catalogue never learnt falls back to words, not to a key', () => {
		const said = summarise(['add_unheard_of_thing'], 'Claude', pt);
		expect(said.body).not.toContain('notify.');
		expect(said.body).toContain('unheard of thing');
	});
});

/**
 * Where a burst takes you: the log, whatever it was about.
 *
 * It used to open the room a burst was about — the todo list for "added 4
 * todos", the notebook when every write named one. That is the wrong guess
 * about the question somebody is asking when they press a notification: the
 * todos are already where they were, and what they want to see is what was
 * done to them.
 */
describe('where a notification points', () => {
	it('is the log of what an assistant did', () => {
		expect(ASSISTANT_LOG_PATH).toBe('/settings/integrations#assistant-activity');
	});

	it('and the hash, because the log is halfway down a long page', () => {
		// `$lib/scroll-to-hash` is what acts on it: the app scrolls its own
		// `main`, so the browser's own anchor handling never applied.
		expect(ASSISTANT_LOG_PATH).toContain('#assistant-activity');
	});
});
