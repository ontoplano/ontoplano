import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CLOSING_STEP, TUTORIALS, screensNeedingTutorials, tutorialFor } from './tutorials';

/**
 * The tours, and the two ways they rot.
 *
 * A tutorial is writing about a page, kept in a different file from the page. So
 * it can be missing — somebody ships a room and nobody writes the tour — and it
 * can be pointing at nothing, which is worse, because a step whose anchor was
 * renamed in a redesign is silently skipped and the tour just gets shorter.
 *
 * Both are caught here. The first is also visible in the app (the button in the
 * corner is red on a screen with no tour) and counted in `docs/reference`; this
 * is the one that fails a build.
 */

/** Every `.svelte` file under `src`, read once. */
function sources(): string[] {
	const out: string[] = [];
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) walk(full);
			else if (entry.name.endsWith('.svelte')) out.push(readFileSync(full, 'utf8'));
		}
	};
	walk(join(process.cwd(), 'src'));
	return out;
}

const markup = sources().join('\n');

/** The anchor a step's selector is asking for, when it is asking for one. */
function anchorOf(target: string): string | null {
	return /^\[data-tour="([a-z-]+)"\]$/.exec(target)?.[1] ?? null;
}

describe('the guided tours', () => {
	it('covers every screen the navigation reaches', () => {
		const missing = screensNeedingTutorials().filter((path) => !tutorialFor(path));
		expect(
			missing,
			`no tutorial written for: ${missing.join(', ')} — add one to src/lib/tutorials.ts`
		).toEqual([]);
	});

	it('points every step at an anchor that exists in the markup', () => {
		const steps = [...Object.values(TUTORIALS).flatMap((t) => t.steps), CLOSING_STEP];
		const dangling: string[] = [];

		for (const step of steps) {
			if (!step.target) continue;
			const anchor = anchorOf(step.target);
			// Anything that is not a plain `data-tour` selector is somebody having
			// reached for a class or an id, which is exactly the coupling the
			// attributes exist to avoid.
			expect(
				anchor,
				`"${step.title}" points at ${step.target}, which is not a data-tour anchor`
			).not.toBeNull();
			if (anchor && !markup.includes(`data-tour="${anchor}"`)) dangling.push(anchor);
		}

		expect(
			dangling,
			`these anchors are in a tour and nowhere in the markup: ${dangling.join(', ')}`
		).toEqual([]);
	});

	it('says something on every step', () => {
		for (const [path, tutorial] of Object.entries(TUTORIALS)) {
			expect(tutorial.steps.length, `${path} has an empty tour`).toBeGreaterThan(0);
			for (const step of tutorial.steps) {
				expect(step.title.length, `${path}: a step with no title`).toBeGreaterThan(0);
				expect(step.body.length, `${path}: "${step.title}" says nothing`).toBeGreaterThan(0);
			}
		}
	});

	it('opens each tour with the room rather than a part of it', () => {
		// The first step of a tour has no target on purpose: it is the sentence
		// that says what the screen is for, and a spotlight on one control while
		// that sentence is read is the wrong thing to be looking at.
		for (const [path, tutorial] of Object.entries(TUTORIALS)) {
			expect(tutorial.steps[0].target, `${path} opens by pointing at something`).toBeUndefined();
		}
	});

	/**
	 * The corner is the closing step's, and nobody else's.
	 *
	 * The dashboard's tour used to end on a step pointing at the help cluster,
	 * and `CLOSING_STEP` — which is appended to every tour — then pointed at a
	 * button inside that same cluster and said the same thing. Two cards in a
	 * row about the same corner, and the second one read as the tour failing to
	 * notice it had already finished.
	 */
	it('leaves the help corner to the step that closes every tour', () => {
		const cluster = ['[data-tour="help-dock"]', '[data-tour="tutorial"]'];
		const offenders: string[] = [];

		for (const [path, tutorial] of Object.entries(TUTORIALS))
			for (const step of tutorial.steps)
				if (step.target && cluster.includes(step.target))
					offenders.push(`${path}: "${step.title}" points at ${step.target}`);

		expect(offenders, 'a tour saying what the closing step already says').toEqual([]);
		// And the closing step is still the one that does say it.
		expect(cluster).toContain(CLOSING_STEP.target);
	});

	it('resolves a detail page to the tour of the list it came from', () => {
		expect(tutorialFor('/diary/notebooks/12')).toBe(TUTORIALS['/diary/notebooks']);
		expect(tutorialFor('/kitchen/recipes/3')).toBe(TUTORIALS['/kitchen/recipes']);
		// And the longest match wins, so People does not fall back to the diary.
		expect(tutorialFor('/diary/people')).toBe(TUTORIALS['/diary/people']);
		// Home is a tour, not a prefix of every path in the app.
		expect(tutorialFor('/admin')).toBeNull();
	});
});
