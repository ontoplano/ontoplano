/**
 * The turn that says "working", worked out ahead of time.
 *
 * The browser plays the turn (see `$lib/mark-spin`); what this file holds is
 * the motion it is handed — the wind-up, the loop, the landing — which is
 * where each of the old complaints lived:
 *
 *   **It never started.** A turn that waited before moving was invisible on
 *   every navigation quicker than the wait.
 *
 *   **It stopped short, or skipped.** A landing that halted a few degrees
 *   from where it stood, or that leapt round to upright in one step, both read
 *   as the mark being interrupted rather than finishing.
 *
 *   **It hung before it landed.** The old loop needed the main thread for
 *   every frame, and the end of a load is when there is none to spare. That is
 *   fixed by who plays it, not by these numbers — and the e2e specs watch it.
 */
import { describe, expect, test } from 'vitest';
import {
	DECEL_DEGREES,
	SPIN_UP_MS,
	TURN_MS,
	angleAlong,
	landingTurn,
	restingPlace,
	runDistance,
	runningTurn
} from '../src/lib/mark-spin';

/** The largest change of angle between two neighbouring points, per ms. */
function fastest(points: { at: number; angle: number }[]): number {
	let most = 0;
	for (let i = 1; i < points.length; i += 1) {
		const span = points[i].at - points[i - 1].at;
		if (span > 0) most = Math.max(most, Math.abs(points[i].angle - points[i - 1].angle) / span);
	}
	return most;
}

const FULL_SPEED = 360 / TURN_MS;

describe('a turn nobody has stopped', () => {
	test('moves from the first moment, rather than after a delay', () => {
		expect(runDistance(16)).toBeGreaterThan(0);
	});

	test('winds up to full speed and holds it', () => {
		const early = runDistance(20) - runDistance(0);
		const late = runDistance(SPIN_UP_MS + 20) - runDistance(SPIN_UP_MS);
		expect(late).toBeGreaterThan(early * 1.5);
		expect(late / 20).toBeCloseTo(FULL_SPEED, 5);
	});

	test('keeps going past a full revolution, for as long as the wait lasts', () => {
		expect(runDistance(3000)).toBeGreaterThan(720);
		expect(runDistance(3100)).toBeGreaterThan(runDistance(3000));
	});

	test('hands the wind-up to the loop without a seam', () => {
		const { windUp, loop } = runningTurn(40, 200, 1);
		expect(windUp[0]).toEqual({ at: 0, angle: 40 });
		expect(loop[0].angle).toBe(windUp[windUp.length - 1].angle);
		expect(loop[1].angle - loop[0].angle).toBe(360);
		// Nowhere quicker than full speed: no leap between keyframes.
		expect(fastest(windUp)).toBeLessThanOrEqual(FULL_SPEED + 1e-9);
	});

	test('turns the other way when the rooms went the other way', () => {
		const { windUp, loop } = runningTurn(0, 0, -1);
		expect(windUp[windUp.length - 1].angle).toBeLessThan(0);
		expect(loop[1].angle).toBeLessThan(loop[0].angle);
	});

	test('is a plain loop once it is already at full speed', () => {
		expect(runningTurn(90, SPIN_UP_MS + 5, 1).windUp).toEqual([]);
	});
});

describe('a turn that has been asked to stop', () => {
	test('rests on a whole turn, in the direction it was going', () => {
		expect(restingPlace(100, 1) % 360).toBe(0);
		expect(restingPlace(100, 1)).toBeGreaterThan(100);
		expect(restingPlace(-100, -1)).toBeLessThan(-100);
	});

	test('goes round once more rather than halting a few degrees on', () => {
		// 350 is ten degrees from upright: too close to slow into.
		expect(restingPlace(350, 1)).toBe(720);
		expect(restingPlace(360 - DECEL_DEGREES, 1)).toBe(360);
	});

	test('goes round once even when it is stopped before it moved', () => {
		// The navigation that is over before it began.
		expect(restingPlace(0, 1)).toBe(360);
	});

	test('lands exactly on its resting place, without a leap to get there', () => {
		const points = landingTurn(200, 400, 1, 360);
		expect(points[0].angle).toBe(200);
		expect(points[points.length - 1].angle).toBe(360);
		for (let i = 1; i < points.length; i += 1)
			expect(points[i].angle).toBeGreaterThanOrEqual(points[i - 1].angle);
		expect(fastest(points)).toBeLessThanOrEqual(FULL_SPEED + 1e-9);
	});

	test('slows as it arrives rather than stopping at full speed', () => {
		const points = landingTurn(0, SPIN_UP_MS, 1, 360);
		const last = points.slice(-3);
		expect(fastest(last)).toBeLessThan(FULL_SPEED * 0.75);
	});

	test('comes to rest from almost nothing, not from half speed', () => {
		// It used to brake only to half speed and stop dead from there.
		const points = landingTurn(0, SPIN_UP_MS, 1, 360);
		expect(fastest(points.slice(-2))).toBeLessThan(FULL_SPEED * 0.2);
	});

	test('begins braking at the speed it was going, without a drop', () => {
		const from = 360 - DECEL_DEGREES;
		const points = landingTurn(from, SPIN_UP_MS, 1, restingPlace(from, 1));
		expect(fastest(points.slice(0, 2))).toBeGreaterThan(FULL_SPEED * 0.9);
	});

	test('lands the other way for a turn going the other way', () => {
		const points = landingTurn(-50, 300, -1, -360);
		expect(points[points.length - 1].angle).toBe(-360);
	});
});

describe('where a stretch of turn is at a given moment', () => {
	const points = [
		{ at: 0, angle: 0 },
		{ at: 10, angle: 100 }
	];

	test('between two points, in proportion', () => {
		expect(angleAlong(points, 5)).toBe(50);
	});

	test('before and after, at the ends', () => {
		expect(angleAlong(points, -1)).toBe(0);
		expect(angleAlong(points, 99)).toBe(100);
	});
});
