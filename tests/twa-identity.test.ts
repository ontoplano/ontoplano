import { describe, expect, it } from 'vitest';
// @ts-expect-error — a build script, plain JS, no types beside it.
import {
	defaultIdentity,
	identityFrom,
	packageIdFor,
	suffixFor
} from '../scripts/twa-identity.mjs';

/**
 * Two of this app on one phone, and no way to confuse them.
 *
 * Android identifies an app by its package name: a staging build sharing
 * production's package does not install beside it, it installs *over* it. And
 * two apps with the same label and the same icon are the same app as far as
 * anybody tapping one is concerned — which is how a real week ends up in the
 * instance that gets wiped.
 */
describe('the package a build claims', () => {
	it('leaves the production name alone', () => {
		expect(suffixFor('app.ontoplano.com')).toBe('');
		expect(packageIdFor('app.ontoplano.com')).toBe('app.ontoplano.twa');
	});

	it('gives every other instance one of its own', () => {
		expect(packageIdFor('staging.ontoplano.com')).toBe('app.ontoplano.twa.staging');
		expect(packageIdFor('demo.ontoplano.com')).toBe('app.ontoplano.twa.demo');
	});

	it('does not start a package segment with a digit', () => {
		// A LAN build points at an address, and `app.ontoplano.twa.192` is not a
		// package name Android will accept.
		expect(packageIdFor('192.168.1.50:1493')).toBe('app.ontoplano.twa.local');
		expect(packageIdFor('10.0.0.2')).toBe('app.ontoplano.twa.local');
	});

	it('lets an explicit name win, for a fork or a second brand', () => {
		expect(packageIdFor('staging.ontoplano.com', 'com.example.thing')).toBe('com.example.thing');
	});
});

describe('the name and icon a build wears', () => {
	const ORIGIN = 'https://staging.ontoplano.com';

	const manifest = {
		name: 'Ontoplano staging',
		short_name: 'Staging',
		icons: [
			{ src: '/icons/icon-192-staging.png', sizes: '192x192', purpose: 'any' },
			{ src: '/icons/icon-512-staging.png', sizes: '512x512', purpose: 'any' },
			{ src: '/icons/icon-maskable-512-staging.png', sizes: '512x512', purpose: 'maskable' }
		]
	};

	it('comes from the manifest the instance serves', () => {
		const app = identityFrom(manifest, ORIGIN);
		expect(app.name).toBe('Ontoplano staging');
		expect(app.iconUrl).toBe(`${ORIGIN}/icons/icon-512-staging.png`);
		expect(app.maskableIconUrl).toBe(`${ORIGIN}/icons/icon-maskable-512-staging.png`);
	});

	it('uses the short name under the icon, because Android truncates', () => {
		// "Ontoplano staging" becomes "Ontoplano s…" in a launcher, which reads
		// as the production app.
		expect(identityFrom(manifest, ORIGIN).launcherName).toBe('Staging');
	});

	it('falls back rather than failing when the instance cannot be asked', () => {
		const app = identityFrom(null, ORIGIN);
		expect(app).toEqual(defaultIdentity(ORIGIN));
		expect(app.name).toBe('Ontoplano');
	});

	it('takes an absolute icon address as it is', () => {
		const app = identityFrom(
			{
				name: 'X',
				icons: [{ src: 'https://cdn.example/i.png', sizes: '512x512', purpose: 'any' }]
			},
			ORIGIN
		);
		expect(app.iconUrl).toBe('https://cdn.example/i.png');
	});

	it('does not mistake the maskable icon for the plain one', () => {
		const app = identityFrom(manifest, ORIGIN);
		expect(app.iconUrl).not.toBe(app.maskableIconUrl);
	});
});
