#!/usr/bin/env node
/**
 * Make a picture the app's mark, everywhere the app has one.
 *
 *   node scripts/adopt-icon.mjs static/icons/new-icon.png
 *
 * There is one source — `src/lib/logo/mark.png` — and everything else is
 * drawn from it: the favicon, the touch icons, the maskable ones, the dev and
 * staging variants, the Android launcher icons for every flavour, and the
 * mark in the app's own header, which imports that file directly. This puts a
 * new picture in that place and redraws the lot, so a build and a deploy after
 * it are already right.
 *
 * It refuses a file that would make bad icons rather than making them: a
 * launcher icon is drawn at 512 and cropped to a circle on some phones, so a
 * small or oblong source is a decision somebody should make deliberately.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = join(ROOT, 'src/lib/logo/mark.png');

/** The smallest source that still draws a clean 512 launcher icon. */
const LEAST_EDGE = 512;
/** How far from square before it is cropped rather than fitted. */
const MOST_SKEW = 1.05;

const from = process.argv[2];
if (!from) {
	console.error('Which picture? node scripts/adopt-icon.mjs static/icons/new-icon.png');
	process.exit(1);
}
const source = join(ROOT, relative(ROOT, from));
if (!existsSync(source)) {
	console.error(`No such file: ${from}`);
	process.exit(1);
}

/** Width and height out of a PNG's header, without a library. */
function size(file) {
	const head = readFileSync(file).subarray(0, 33);
	const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
	if (!head.subarray(0, 8).equals(png)) return null;
	return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const dimensions = size(source);
if (!dimensions) {
	console.error(`${from} is not a PNG. The mark is a PNG — everything else is drawn from it.`);
	process.exit(1);
}
const { width, height } = dimensions;
if (width < LEAST_EDGE || height < LEAST_EDGE) {
	console.error(
		`${from} is ${width}×${height}. A launcher icon is drawn at ${LEAST_EDGE} and ` +
			'scaling one up shows. Export it bigger.'
	);
	process.exit(1);
}
const skew = Math.max(width / height, height / width);
if (skew > MOST_SKEW) {
	console.error(
		`${from} is ${width}×${height}, which is not square. Every icon this becomes is a ` +
			'square or a circle, so the difference would be cropped off. Square it first.'
	);
	process.exit(1);
}

copyFileSync(source, MARK);
console.log(`mark: src/lib/logo/mark.png ← ${from} (${width}×${height})`);

/** Each step says what it did; a missing toolchain says so and stops. */
const run = (label, args) => {
	try {
		execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' });
	} catch {
		console.error(`\n${label} did not finish. The mark is in place; run it again once fixed.`);
		process.exit(1);
	}
};

run('the web icons', ['scripts/build-icons.mjs']);
run('the Android launcher icons', ['scripts/brand-android.mjs']);
run("each flavour's icons", ['scripts/android-flavours.mjs']);

console.log(
	'\nEvery icon is redrawn. The app header follows automatically — it imports the mark.\n' +
		'Commit the result; the next build and deploy carry it.'
);
