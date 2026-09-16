/**
 * The job checker reads imports, not the word "import".
 *
 * `scripts/check-job-deps.mjs` walks what the scheduled scripts pull in and
 * fails the build when one of them is not a real dependency — worth having,
 * because those scripts run on a box with `yarn install --production`, and a
 * package missing there is a job that dies at six in the morning.
 *
 * It read the bare word `from` anywhere in a file, so a tool whose arguments
 * are called `from` and `to` — `day(args.from, 'from')` — looked like an
 * import of everything between that quote and the next. CI failed naming a
 * package `), day(args.to,`, which is nobody's dependency and never was.
 */
import { describe, expect, it } from 'vitest';

import { importsIn } from '../scripts/check-job-deps.mjs';

const found = (source: string): string[] => importsIn(source).statics;

describe('what the job checker calls an import', () => {
	it('reads a plain one', () => {
		expect(found(`import { readFileSync } from 'node:fs';`)).toEqual(['node:fs']);
	});

	it('reads one written across several lines', () => {
		expect(found(`import {\n\tone,\n\ttwo\n} from './somewhere.js';`)).toEqual(['./somewhere.js']);
	});

	it('reads one imported for its side effects', () => {
		expect(found(`import './register.js';`)).toEqual(['./register.js']);
	});

	it('does not read the word from inside a string', () => {
		// The exact shape that broke the build.
		const source = `due: billsDueBetween(ctx, day(args.from, 'from'), day(args.to, 'to'))`;
		expect(found(source)).toEqual([]);
	});

	it('nor a property called from', () => {
		expect(found(`const when = args.from; const label = 'from';`)).toEqual([]);
	});

	it('and still sees the import on a line that also mentions from', () => {
		const source = [
			`import { day } from './time.js';`,
			`const label = 'from';`,
			`export const x = day(args.from, 'from');`
		].join('\n');
		expect(found(source)).toEqual(['./time.js']);
	});
});
