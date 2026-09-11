import { describe, expect, it } from 'vitest';
import { FEATURES, FULL, can, whyNot, type Capabilities } from '../src/lib/capabilities';

/**
 * What an instance can do, and the sentence it says when it cannot.
 *
 * The rule this is really guarding is a product one: ontoplano has no plans
 * and no "Pro", so a wall a person meets here has to read as a fact about
 * where their copy is running — and it has to name the way round it that does
 * not involve paying us, because that way genuinely exists and pretending
 * otherwise would be a lie about free software.
 */
const PHONE: Capabilities = { reachable: false, awake: false };

describe('a normal instance', () => {
	it('can do everything', () => {
		for (const key of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
			expect(can(FULL, key), key).toBe(true);
			expect(whyNot(FULL, key), key).toBeNull();
		}
	});
});

describe('an instance living on the phone it is used from', () => {
	it('cannot do the things that are somebody else dialling in', () => {
		expect(can(PHONE, 'calendarFeed')).toBe(false);
		expect(can(PHONE, 'assistants')).toBe(false);
		expect(can(PHONE, 'streams')).toBe(false);
	});

	it('cannot do the things that happen while nobody is looking', () => {
		expect(can(PHONE, 'reviewMail')).toBe(false);
		expect(can(PHONE, 'reminderMail')).toBe(false);
	});

	it('says why, and names both ways round it', () => {
		for (const key of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
			const said = whyNot(PHONE, key);
			expect(said, key).toBeTruthy();

			// Self-hosting first, and always present: it is the answer that costs
			// nothing, and leaving it out would turn a fact into a sales pitch.
			expect(said, key).toContain('Run ontoplano on a machine');
			expect(said, key).toContain('hosts for you');
		}
	});

	it('never says it is a plan', () => {
		// There is no Pro in this app. A capability is where the instance runs,
		// never what the account bought.
		for (const key of Object.keys(FEATURES) as (keyof typeof FEATURES)[]) {
			const said = (whyNot(PHONE, key) ?? '').toLowerCase();
			for (const word of ['pro', 'upgrade', 'plan', 'premium', 'paid', 'subscribe']) {
				expect(said.split(/\W+/), `${key} says "${word}"`).not.toContain(word);
			}
		}
	});
});

describe('the wiring only splits two ways', () => {
	it('because a third question is a plan wearing a disguise', () => {
		const needs = new Set(Object.values(FEATURES).map((f) => f.needs));
		expect([...needs].sort()).toEqual(['awake', 'reachable']);
	});
});
