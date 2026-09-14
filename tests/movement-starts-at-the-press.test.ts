import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

/**
 * The movement between screens hangs on the hook that fires at the press.
 *
 * It hung on `onNavigate` for a release, and did nothing: SvelteKit's
 * `navigate()` awaits `load_route(intent)` and only *then* calls the
 * `onNavigate` callbacks, so the screen began moving at the moment the data
 * arrived. That is the behaviour the change was written to remove — press a
 * tab on a slow connection, watch the bar fill, and the movement happens once
 * the wait is over — and it shipped as the fix for it, comment and all.
 *
 * Nothing caught it. Against a local server a room loads in a few
 * milliseconds, so both orders look the same on a laptop, and the browser
 * tests cannot hold the data back reliably: a tab change fetches nothing at
 * all, because the room's data is already in hand.
 *
 * So what is pinned is the wiring. `beforeNavigate` runs when the press
 * happens, before anything is asked for; `onNavigate` runs after the answer is
 * in. Only one of them can be the start of a movement.
 */
const MOVERS = ['src/routes/+layout.svelte', 'src/lib/components/TabbedRoom.svelte'];

describe('the screen moves when you ask it to', () => {
	for (const file of MOVERS) {
		test(`${file} starts the movement in beforeNavigate`, () => {
			const source = readFileSync(file, 'utf8');

			// The movement itself: a copy of the outgoing screen is sent off and
			// the panel behind it is brought on. The arrival is kept — `landOn`
			// asks whether it is still running when the data finally lands — so
			// the second half may be assigned rather than called bare.
			const movement = /slideAway\([^)]*\);\s*\n\s*(?:\w+ = )?slideOn\(/;
			expect(movement.test(source), 'both halves of the movement are here').toBe(true);

			// And the block they sit in is the one that runs at the press.
			const hook = source.slice(0, source.search(movement)).lastIndexOf('Navigate((');
			const opener = source.slice(Math.max(0, hook - 20), hook + 10);
			expect(opener, 'the movement is inside beforeNavigate').toContain('beforeNavigate((');

			// `onNavigate` fires after the load, so nothing here may call it —
			// nor import it, and leave it lying there for a later hand. The name
			// appears in these files' own comments, saying exactly this, so it is
			// the call and the import that are looked for rather than the word.
			expect(source, 'nothing calls onNavigate').not.toContain('onNavigate(');
			const imports = source.match(/import \{[^}]*\} from '\$app\/navigation';/g) ?? [];
			expect(imports.join(' '), 'nor imports it').not.toContain('onNavigate');
		});
	}
});
