import { describe, expect, it } from 'vitest';
import { titleOf } from '../src/lib/page-title.svelte';

describe('the one title builder', () => {
	it('says the parts most specific first and ends in the instance name', () => {
		expect(titleOf(['Account', 'Settings'], 'Ontoplano — Dev')).toBe(
			'Account · Settings · Ontoplano — Dev'
		);
	});

	it('says a repeated part once and drops empty ones', () => {
		expect(titleOf(['Notebooks', 'Notebooks'], 'Ontoplano')).toBe('Notebooks · Ontoplano');
		expect(titleOf([undefined, '', 'Goals'], 'Ontoplano')).toBe('Goals · Ontoplano');
		expect(titleOf([], 'Ontoplano')).toBe('Ontoplano');
	});
});
