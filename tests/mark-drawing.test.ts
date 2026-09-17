/**
 * The drawing inside the ring, traced for the one place that gets no colour.
 *
 * Android's status bar keeps a small icon's alpha and throws its colours away,
 * so what it shows is an outline. That used to be the octagon with a filled
 * dot in the middle: derived from the mark, and not recognisable as it.
 * `yarn icons` traces the artwork itself now, and `brand-android.mjs` writes
 * the result into the vector drawable.
 *
 * Which means the icon on a phone is only as good as a tracer nobody looks at,
 * on artwork that gets replaced. These are what notice.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { MARK_DRAWING } from '../src/lib/logo/mark-shape';
import { MARK_TURN_HOLE_RADIUS, MARK_TURN_RADIUS } from '../src/lib/logo/mark-geometry';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRAWABLE = 'capacitor/android/app/src/main/res/drawable/ic_stat_ontoplano.xml';

/** The box the paths are written in — `TRACE_VIEWBOX` in the generator. */
const VIEWBOX = 24;

describe('the traced drawing', () => {
	test('has an outline and at least one hole in it', () => {
		/*
		 * Two loops at the least: whatever the mark carries, and a gap inside
		 * it. A trace that collapses to one closed blob is what a status bar
		 * shows as a lump, and it is the failure mode worth catching — the
		 * thresholds that decide it were read off a raster of one size and
		 * quietly meant something else at another.
		 */
		expect(MARK_DRAWING.length).toBeGreaterThanOrEqual(2);
	});

	test('is drawn in the box it says it is', () => {
		for (const path of MARK_DRAWING) {
			const points = [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)];
			expect(points.length).toBeGreaterThan(3);
			for (const [, x, y] of points) {
				expect(Number(x)).toBeGreaterThanOrEqual(0);
				expect(Number(x)).toBeLessThanOrEqual(VIEWBOX);
				expect(Number(y)).toBeGreaterThanOrEqual(0);
				expect(Number(y)).toBeLessThanOrEqual(VIEWBOX);
			}
			expect(path.trimEnd().endsWith('Z')).toBe(true);
		}
	});

	test('reaches the status bar as one path, so the hole is a hole', () => {
		/*
		 * Even-odd cuts a hole where subpaths overlap *within a path*. Split
		 * across a path each, the eye is a filled dot on the bird's face — and
		 * it would look deliberate, which is why nothing else would catch it.
		 */
		const xml = readFileSync(join(ROOT, DRAWABLE), 'utf8');
		const filled = [...xml.matchAll(/<path\b[\s\S]*?\/>/g)].filter((m) =>
			m[0].includes('fillColor')
		);
		expect(filled).toHaveLength(1);
		expect(filled[0][0]).toContain('android:fillType="evenOdd"');

		const moves = filled[0][0].match(/pathData="([^"]+)"/)![1].match(/M/g) ?? [];
		expect(moves).toHaveLength(MARK_DRAWING.length);
	});
});

describe('the hole under the turning layer', () => {
	test('is cut inside the disc, so the two overlap', () => {
		/*
		 * A mask's edge and a clip path's edge are antialiased separately and
		 * do not add back up to an opaque pixel: cut on the same circle, they
		 * leave a hairline of nothing between the rim and what turns inside
		 * it. The rim layer reaches in past the disc's edge instead, and what
		 * it draws in that ring is covered.
		 */
		expect(MARK_TURN_HOLE_RADIUS).toBeLessThan(MARK_TURN_RADIUS);
		expect(MARK_TURN_HOLE_RADIUS).toBeGreaterThan(0);
	});
});
