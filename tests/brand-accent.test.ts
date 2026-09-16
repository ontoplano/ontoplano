/**
 * The colour a notification arrives in, and the one thing it has to say.
 *
 * Two instances can be open on one phone — the copy it carries and a server —
 * and a notification that does not say which it came from is one you have to
 * open to find out. The obvious answer is not available: Android keeps only
 * the alpha channel of a small icon, so the mark is a white silhouette either
 * way and a black-and-white version of it would be the same picture. The
 * accent is the one colour the system takes.
 */
import { describe, expect, test } from 'vitest';
import {
	MARK_DRAINED,
	NOTIFICATION_ACCENT,
	NOTIFICATION_ACCENT_ISOLATED,
	drainedHex
} from '../src/lib/logo/brand';

describe('the notification accent', () => {
	test('tells the two instances apart', () => {
		expect(NOTIFICATION_ACCENT_ISOLATED).not.toBe(NOTIFICATION_ACCENT);
	});

	test('is the same colour with the lights off, not a different one', () => {
		// Drained towards its own luminance, so it stays recognisably this blue
		// rather than becoming a grey that reads as a disabled notification.
		const grey = (hex: string) => {
			const at = (i: number) => parseInt(hex.slice(i, i + 2), 16);
			return 0.2126 * at(1) + 0.7152 * at(3) + 0.0722 * at(5);
		};
		expect(grey(NOTIFICATION_ACCENT_ISOLATED)).toBeCloseTo(grey(NOTIFICATION_ACCENT), 0);
	});

	test('leaves a trace of colour in, rather than none', () => {
		expect(MARK_DRAINED).toBeGreaterThan(0);
		const spread = (hex: string) => {
			const at = (i: number) => parseInt(hex.slice(i, i + 2), 16);
			return Math.max(at(1), at(3), at(5)) - Math.min(at(1), at(3), at(5));
		};
		expect(spread(NOTIFICATION_ACCENT_ISOLATED)).toBeGreaterThan(0);
		expect(spread(NOTIFICATION_ACCENT_ISOLATED)).toBeLessThan(spread(NOTIFICATION_ACCENT));
	});

	test('draining is the same arithmetic an SVG saturate filter does', () => {
		// Nothing at all left is a flat grey; all of it left is the colour back.
		expect(drainedHex('#1d4ed8', 1)).toBe('#1d4ed8');
		const flat = drainedHex('#1d4ed8', 0);
		expect(flat.slice(1, 3)).toBe(flat.slice(3, 5));
		expect(flat.slice(3, 5)).toBe(flat.slice(5, 7));
	});

	test('the Android resource carries the same number the app does', async () => {
		// Java cannot import a TypeScript constant, so `brand-android.mjs`
		// writes it into a colour resource. Two literals would be two answers
		// to what colour ontoplano is.
		const { readFileSync } = await import('node:fs');
		const xml = readFileSync(
			'capacitor/android/app/src/main/res/values/ontoplano_brand.xml',
			'utf8'
		);
		expect(xml).toContain(`<color name="ontoplano_accent">${NOTIFICATION_ACCENT}</color>`);
	});
});
