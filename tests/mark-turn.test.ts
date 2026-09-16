/**
 * The layer that turns cannot cut into the drawing.
 *
 * While the app waits, a second copy of the mark clipped to a disc spins over
 * the still one. That is invisible only while the circle it is cut on is flat
 * dark field: cut it anywhere the artwork actually has something, and what you
 * get is a circular piece of the logo rotating inside the logo.
 *
 * The radius used to be the measured medallion plus a margin, which is fine
 * for a mark whose middle IS a medallion and wrong for one whose middle is a
 * drawing — the disc landed inside the artwork and turned a hole in it, and
 * nothing failed. These read the pixels, so the next mark that does not suit
 * the assumption is a red test rather than something to notice in motion.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { describe, expect, test } from 'vitest';

import { MARK_FIELD, MARK_INNER } from '../src/lib/logo/mark-shape';
import { MARK_TURN_RADIUS } from '../src/lib/logo/mark-geometry';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const png = PNG.sync.read(readFileSync(join(ROOT, 'src/lib/logo/mark.png')));

/** The same tolerance `scripts/build-icons.mjs` measures the field with. */
const FIELD_TOLERANCE = 45;
const field = [1, 3, 5].map((i) => parseInt(MARK_FIELD.slice(i, i + 2), 16));

const cx = png.width / 2;
const cy = png.height / 2;

function pixel(x: number, y: number) {
	const i = (Math.round(y) * png.width + Math.round(x)) << 2;
	return {
		r: png.data[i],
		g: png.data[i + 1],
		b: png.data[i + 2],
		a: png.data[i + 3]
	};
}

const isField = (p: ReturnType<typeof pixel>) =>
	p.a > 200 &&
	Math.abs(p.r - field[0]) + Math.abs(p.g - field[1]) + Math.abs(p.b - field[2]) <= FIELD_TOLERANCE;

describe('the turning layer', () => {
	test('is cut on a circle of nothing but field', () => {
		const radius = MARK_TURN_RADIUS * cx;
		const wrong: string[] = [];

		for (let k = 0; k < 720; k++) {
			const angle = (k / 720) * Math.PI * 2;
			const x = cx + Math.cos(angle) * radius;
			const y = cy + Math.sin(angle) * radius;
			const p = pixel(x, y);
			if (!isField(p)) wrong.push(`${((k / 720) * 360).toFixed(0)}° rgb(${p.r},${p.g},${p.b})`);
		}

		expect(wrong.slice(0, 8)).toEqual([]);
	});

	test('holds everything the mark carries inside it', () => {
		/*
		 * Nothing but field between where the disc is cut and the ring it is
		 * cut inside of. Anything else there is artwork left outside the disc —
		 * the half of the failure the circle test cannot see, because a beak
		 * that reaches past the cut misses it between two rays.
		 */
		const from = MARK_TURN_RADIUS * cx;
		const to = MARK_INNER * cx;
		const stray: string[] = [];

		for (let y = 0; y < png.height; y++) {
			for (let x = 0; x < png.width; x++) {
				const r = Math.hypot(x - cx, y - cy);
				if (r < from || r > to) continue;
				const p = pixel(x, y);
				if (p.a === 0) continue;
				if (!isField(p)) stray.push(`${x},${y} rgb(${p.r},${p.g},${p.b})`);
			}
		}

		expect(stray.slice(0, 8)).toEqual([]);
	});

	test('is a disc worth turning', () => {
		// Degenerate answers — a measurement that found nothing, or one that
		// swallowed the ring — both read as "it turns" and neither does.
		expect(MARK_TURN_RADIUS).toBeGreaterThan(0.2);
		expect(MARK_TURN_RADIUS).toBeLessThan(1);
	});
});
