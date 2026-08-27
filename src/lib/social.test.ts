import { describe, expect, test } from 'vitest';
import { configuredProviders } from './social';

/**
 * An instance offers exactly what it can actually complete.
 *
 * A button that opens Google and comes back with "invalid client" is worse than
 * no button, so half-configured counts as not configured.
 */
describe('which social sign-ins an instance offers', () => {
	test('none, by default', () => {
		expect(configuredProviders({})).toEqual([]);
	});

	test('one that is fully configured', () => {
		expect(configuredProviders({ GOOGLE_CLIENT_ID: 'a', GOOGLE_CLIENT_SECRET: 'b' })).toEqual([
			'google'
		]);
	});

	test('both, in a stable order', () => {
		expect(
			configuredProviders({
				GITHUB_CLIENT_ID: 'a',
				GITHUB_CLIENT_SECRET: 'b',
				GOOGLE_CLIENT_ID: 'c',
				GOOGLE_CLIENT_SECRET: 'd'
			})
		).toEqual(['google', 'github']);
	});

	test('half-configured is not configured', () => {
		expect(configuredProviders({ GOOGLE_CLIENT_ID: 'a' })).toEqual([]);
		expect(configuredProviders({ GOOGLE_CLIENT_SECRET: 'b' })).toEqual([]);
	});

	test('an empty string is not a credential', () => {
		expect(configuredProviders({ GOOGLE_CLIENT_ID: '  ', GOOGLE_CLIENT_SECRET: 'b' })).toEqual([]);
	});
});
