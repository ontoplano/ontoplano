/**
 * The Android app wears ontoplano's own name and icon.
 *
 * Capacitor generates its project with a stock icon and whatever name the
 * config gives it, and `cap add`/`cap sync` will happily put the stock one
 * back. So the branding is applied from here, on every build, out of the
 * same `src/lib/logo/mark.png` everything else is derived from — see
 * `scripts/build-icons.mjs`, which makes the PNGs this reads.
 *
 * There is one ontoplano app. It is not labelled by how it was built.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'capacitor/android/app/src/main/res');

/** The app's one name, everywhere it is written. */
const APP_NAME = 'ontoplano';

/**
 * Launcher sizes, in the densities Android asks for. The square icon is the
 * plain one; the foreground of the adaptive icon is the maskable drawing,
 * which carries the safe-zone padding the OS crops into.
 */
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

/*
 * The same source at the same size gives the same bytes, every time.
 *
 * ImageMagick stamps a PNG with the moment it wrote it and whatever else it
 * knows, so re-running this rewrote every icon with different bytes and left
 * eighty modified files in the tree after a build. `-strip` and excluding the
 * date chunks make the output a function of the input, which is what lets
 * these be committed — F-Droid builds from the committed project and cannot
 * run an image toolchain to make them.
 */
function resize(source, out, size) {
	execFileSync('magick', [
		source,
		'-resize',
		`${size}x${size}`,
		'-strip',
		'-define',
		'png:exclude-chunk=date,time,tIME',
		out
	]);
}

if (!existsSync(RES)) {
	console.log('brand: no capacitor android project yet — nothing to brand');
	process.exit(0);
}

const square = join(ROOT, 'static/icons/icon-512.png');
const maskable = join(ROOT, 'static/icons/icon-maskable-512.png');

for (const [density, size] of Object.entries(LAUNCHER)) {
	const dir = join(RES, `mipmap-${density}`);
	mkdirSync(dir, { recursive: true });
	resize(square, join(dir, 'ic_launcher.png'), size);
	resize(square, join(dir, 'ic_launcher_round.png'), size);
	resize(maskable, join(dir, 'ic_launcher_foreground.png'), FOREGROUND[density]);
}

// The adaptive icon's background: the mark's own field rather than a stock
// green, so the rounded, squircle and circle masks all cut ontoplano.
mkdirSync(join(RES, 'values'), { recursive: true });
writeFileSync(
	join(RES, 'values/ic_launcher_background.xml'),
	`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#FFFFFF</color>
</resources>
`
);

const strings = join(RES, 'values/strings.xml');
const before = readFileSync(strings, 'utf8');
const after = before
	.replace(
		/<string name="app_name">[^<]*<\/string>/,
		`<string name="app_name">${APP_NAME}</string>`
	)
	.replace(
		/<string name="title_activity_main">[^<]*<\/string>/,
		`<string name="title_activity_main">${APP_NAME}</string>`
	);
if (after !== before) writeFileSync(strings, after);

console.log(`brand: ${APP_NAME}, icons from src/lib/logo/mark.png`);
