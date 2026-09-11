/**
 * The masks behind the page turn, and the stylesheet that names them.
 *
 * A dissolve wants a threshold sliding across a field of noise — every pixel
 * fully on or fully off, flipping in a random order — and CSS has no way to
 * threshold a mask image. What it can do, cheaply and on the GPU, is swap one
 * mask for another at a keyframe. So the thresholds are computed here, once,
 * and shipped as tiny tiling PNGs: `out-*` take the old screen away, `in-*`
 * bring the new one in, and each pair is cut from the same field so a dot
 * leaving one is the dot arriving on the other.
 *
 * The stylesheet is written here too. It has to name every step and the size
 * of the stamp, which are facts about these images — a hand-written copy is a
 * second place to get the same numbers right, and it would break silently.
 * Every number comes from `src/lib/page-turn.js`; nothing is decided here.
 *
 *   node scripts/build-eink-masks.mjs            redraw them
 *   node scripts/build-eink-masks.mjs --check    fail if they are stale
 *
 * Deterministic: same values, same bytes, so re-running never churns the repo.
 */
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PAGE_TURN } from '../src/lib/page-turn.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MASKS = join(ROOT, 'static', PAGE_TURN.dir);
const STYLESHEET = join(ROOT, 'src', 'routes', 'page-turn.css');

const CHECK = process.argv.includes('--check');

/** Deterministic, so the committed output is a function of the config alone. */
function random(seed) {
	let s = seed >>> 0;
	return () => {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		return ((s >>> 0) % 100000) / 100000;
	};
}

const CRC = (() => {
	const table = new Int32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c;
	}
	return (buf) => {
		let c = -1;
		for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
		return (c ^ -1) >>> 0;
	};
})();

function chunk(type, body) {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(body.length, 0);
	head.write(type, 4, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), body])), 0);
	return Buffer.concat([head, body, crc]);
}

/**
 * An 8-bit grey+alpha PNG, which is the smallest thing a CSS mask can read.
 *
 * Grey+alpha rather than luminance, so no `mask-mode` is needed: the default
 * reads the alpha channel, and a mask that depends on `mask-mode: luminance`
 * is a mask that silently does nothing where that is not supported.
 */
function png(size, alpha) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 4; // colour type: grey + alpha
	const raw = Buffer.alloc(size * (1 + size * 2));
	let at = 0;
	for (let y = 0; y < size; y++) {
		raw[at++] = 0; // filter: none
		for (let x = 0; x < size; x++) {
			raw[at++] = 0; // grey, irrelevant behind the alpha
			raw[at++] = alpha[y * size + x];
		}
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

/** Every mask, as the bytes each file should hold. */
function masks() {
	const { steps, tilePx, dotPx, seed } = PAGE_TURN;
	const next = random(seed);
	const cells = tilePx / dotPx;
	// One field, thresholded `steps` ways. Both directions read the same numbers.
	const field = Array.from({ length: cells * cells }, next);
	const files = new Map();

	for (let step = 0; step < steps; step++) {
		// `(step + 1) / steps`, so the last frame of the outgoing screen is empty
		// and the last frame of the incoming one is whole.
		const threshold = (step + 1) / steps;
		const out = new Uint8Array(tilePx * tilePx);
		const into = new Uint8Array(tilePx * tilePx);

		for (let y = 0; y < tilePx; y++) {
			for (let x = 0; x < tilePx; x++) {
				const value = field[Math.floor(y / dotPx) * cells + Math.floor(x / dotPx)];
				const i = y * tilePx + x;
				out[i] = value >= threshold ? 255 : 0;
				into[i] = value < threshold ? 255 : 0;
			}
		}

		files.set(`out-${step}.png`, png(tilePx, out));
		files.set(`in-${step}.png`, png(tilePx, into));
	}

	return files;
}

/** One keyframe per step, each naming the mask for its slice of the turn. */
function keyframes(name, prefix) {
	const { steps, dir } = PAGE_TURN;
	const stops = Array.from({ length: steps }, (_, step) => {
		const at = Number(((step / steps) * 100).toFixed(4));
		return `\t${at}% {\n\t\tmask-image: url('${dir}/${prefix}-${step}.png');\n\t}`;
	});
	return `@keyframes ${name} {\n${stops.join('\n')}\n}`;
}

function stylesheet() {
	const { durationMs, steps, tilePx, dotPx } = PAGE_TURN;

	return `/*
 * The page turn. GENERATED by scripts/build-eink-masks.mjs — do not edit.
 *
 * Change the numbers in src/lib/page-turn.js and run \`yarn eink\`. The one
 * exception is the duration: it is a custom property, stamped onto the
 * document from the same file at startup, so changing that alone needs no
 * regeneration and can be tried live in the inspector.
 *
 * Routes change the way an e-reader changes page: the old screen breaks up
 * into dots and the new one arrives in the gaps they leave, both over one
 * shared field of noise, so a dot going out is a dot coming in. There is no
 * CSS that thresholds a mask, and the SVG turbulence filter that does it in a
 * line recomputes noise over the whole viewport every frame on the CPU. These
 * ${steps * 2} images are about a kilobyte each and swapping one is compositor work,
 * which is the difference between an effect that costs nothing and one that
 * costs the thing it is decorating.
 *
 * ${steps} steps of ${dotPx}px dots on a ${tilePx}px stamp, ${durationMs}ms end to end.
 */

:root {
	--page-turn: ${durationMs}ms;
}

/*
 * A tap during the turn reaches the app, not the photograph.
 *
 * The snapshots are drawn in the browser's top layer, above everything, and
 * they take the pointer with them — so for half a second every press would
 * land on a picture of a screen that is no longer there and simply be lost.
 * Nothing in that layer is interactive by design, so none of it is hit-tested.
 */
::view-transition,
::view-transition-group(*),
::view-transition-image-pair(*),
::view-transition-old(*),
::view-transition-new(*) {
	pointer-events: none;
}

@media (prefers-reduced-motion: no-preference) {
	::view-transition-old(root),
	::view-transition-new(root) {
		/*
		 * The browser's own cross-fade, off.
		 *
		 * Its default fades both layers and sets \`mix-blend-mode: plus-lighter\`
		 * to stop the middle of that fade going grey. Left on underneath these
		 * masks it washes the dots into a smear — the exact look this replaces.
		 */
		mix-blend-mode: normal;
		mask-size: ${tilePx}px ${tilePx}px;
		mask-repeat: repeat;
	}

	/*
	 * \`step-end\` holds each mask for its whole slice. Without it the browser
	 * flips halfway between keyframes, as it does with anything it cannot
	 * interpolate, and every step lands late.
	 */
	::view-transition-old(root) {
		animation: page-turn-out var(--page-turn) step-end both;
	}

	::view-transition-new(root) {
		animation: page-turn-in var(--page-turn) step-end both;
	}

	${keyframes('page-turn-out', 'out').split('\n').join('\n\t')}

	${keyframes('page-turn-in', 'in').split('\n').join('\n\t')}
}
`;
}

const wanted = masks();
const css = stylesheet();

if (CHECK) {
	const stale = [];
	for (const [name, bytes] of wanted) {
		const path = join(MASKS, name);
		if (!existsSync(path) || !readFileSync(path).equals(bytes)) stale.push(name);
	}
	if (!existsSync(STYLESHEET) || readFileSync(STYLESHEET, 'utf8') !== css) {
		stale.push('page-turn.css');
	}

	if (stale.length) {
		console.error(
			`eink: ${stale.length} generated file(s) do not match src/lib/page-turn.js:\n` +
				stale.map((n) => `  ${n}`).join('\n') +
				'\nRun: yarn eink'
		);
		process.exit(1);
	}

	console.log(`eink: ${wanted.size} masks and the stylesheet are current`);
} else {
	mkdirSync(MASKS, { recursive: true });
	for (const [name, bytes] of wanted) writeFileSync(join(MASKS, name), bytes);
	writeFileSync(STYLESHEET, css);

	console.log(
		`eink: ${wanted.size} masks in static${PAGE_TURN.dir}/, ` +
			`${PAGE_TURN.tilePx}px stamp, ${PAGE_TURN.dotPx}px dots, ${PAGE_TURN.durationMs}ms`
	);
}
