import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Who may tell the reminders job which moment to work from.
 *
 * Ordinarily the pass uses the clock. `?at=` makes it consider due whatever
 * was due *then* — which is how a box that was down for an hour catches up,
 * and how the suite walks a reminder from the form to the badge without
 * waiting on one.
 *
 * It is a widening even though the token is unchanged: a caller holding the
 * health token could otherwise make tomorrow's reminders arrive today. So it
 * is behind a setting, off by default, and this is what says so — the default
 * lives in a template string that nothing else would fail on if it flipped.
 */
describe('replaying a window', () => {
	const config = readFileSync('src/lib/server/config.ts', 'utf8');
	const endpoint = readFileSync('src/routes/api/jobs/reminders/+server.ts', 'utf8');
	// The gate every job endpoint is wrapped in — see `$lib/server/jobs`.
	const gate = readFileSync('src/lib/server/jobs.ts', 'utf8');

	test('is off unless the instance says otherwise', () => {
		// The shipped template, which is what a fresh instance writes out.
		expect(config).toMatch(/job_replay = \$\{q\(config\.instance\.jobReplay\)\}/);
		expect(config).toMatch(/jobReplay: instance\.job_replay === 'true'/);
	});

	test('is refused rather than ignored when it is off', () => {
		/*
		 * Ignoring it would run the pass against the real clock and answer as
		 * though the replay had happened — which is how an operator concludes
		 * the missed window is covered when it is not.
		 */
		expect(endpoint).toMatch(/instance\.jobReplay/);
		expect(endpoint).toMatch(/status: 403/);
	});

	test('still needs the health token, as the whole endpoint does', () => {
		expect(endpoint).toMatch(/jobEndpoint\(/);
		expect(gate).toMatch(/tokenMatches\(want, given\)/);
		// The token check comes first: the gate refuses before it runs the
		// handler, so an unauthorised caller learns nothing about whether this
		// instance allows a replay.
		expect(gate.indexOf('tokenMatches')).toBeLessThan(gate.indexOf('await run('));
	});
});
