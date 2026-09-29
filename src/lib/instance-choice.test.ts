import { describe, expect, it } from 'vitest';
import { followSuggestion } from './instance-choice';

describe('followSuggestion', () => {
	const old = 'http://192.168.1.11:1493';
	const fresh = 'http://192.168.1.2:1493';

	it('moves a choice that was the old suggestion onto the new one', () => {
		expect(followSuggestion(old, old, fresh)).toBe(fresh);
	});

	it('leaves an address somebody typed alone', () => {
		expect(followSuggestion('https://my.box', old, fresh)).toBe('https://my.box');
	});

	it('leaves the choice alone when nothing was written down, or nothing is suggested', () => {
		expect(followSuggestion(old, null, fresh)).toBe(old);
		expect(followSuggestion(old, old, null)).toBe(old);
	});
});
