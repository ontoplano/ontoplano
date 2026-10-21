import { describe, expect, it } from 'vitest';
import { CARD_OPTIONS, parseCardOptions, withCardOption } from './dashboard';

/**
 * A card's own settings, checked against the one list that declares them.
 *
 * What is stored is a setting somebody's browser posted, so it is read back
 * through `CARD_OPTIONS` every time: a value the card does not offer, an option
 * it does not have, or a card that is not there is never what the card shows.
 */
describe('card options', () => {
	it('start where the card starts, with nothing stored', () => {
		expect(parseCardOptions(null).nextDays.view).toBe(CARD_OPTIONS.nextDays.view.start);
		expect(parseCardOptions('not json').nextDays.view).toBe('list');
	});

	it('keep a value the card offers', () => {
		const stored = withCardOption(null, 'nextDays', 'view', 'timeline');
		expect(stored).not.toBeNull();
		expect(parseCardOptions(stored).nextDays.view).toBe('timeline');
	});

	it('refuse a value, an option or a card that is not declared', () => {
		expect(withCardOption(null, 'nextDays', 'view', 'spiral')).toBeNull();
		expect(withCardOption(null, 'nextDays', 'colour', 'red')).toBeNull();
		expect(withCardOption(null, 'nobody', 'view', 'list')).toBeNull();
	});

	it('read a stored value the card no longer offers as its start', () => {
		const stored = JSON.stringify({ nextDays: { view: 'spiral' } });
		expect(parseCardOptions(stored).nextDays.view).toBe('list');
	});
});
