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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { squareIcon } from './android-icons.mjs';
import { alreadyDone, remember } from './lib/unchanged.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'capacitor/android/app/src/main/res');

/**
 * The mark's outline, read from the file `yarn icons` measures it into rather
 * than copied — the shape belongs to the logo, and a second copy of it is a
 * second answer to the same question.
 */
const MARK_OUTLINE = (() => {
	const shape = readFileSync(join(ROOT, 'src/lib/logo/mark-shape.ts'), 'utf8');
	const found = shape.match(/export const MARK_CLIP_PATH =\s*'([^']+)'/);
	if (!found) throw new Error('src/lib/logo/mark-shape.ts no longer exports MARK_CLIP_PATH');
	return found[1];
})();

/**
 * How much of the foreground layer the mark fills, read from brand.ts rather
 * than repeated — the arithmetic behind the number is written out there.
 */
/**
 * The legacy launcher icon's margin, which is the maskable one's.
 *
 * Both are squares something may round the corners off, and neither gets a
 * safe zone from anywhere else. `MASKABLE_SCALE` says the rest.
 */
const LEGACY_SCALE = (() => {
	const brand = readFileSync(join(ROOT, 'src/lib/logo/brand.ts'), 'utf8');
	const found = brand.match(/export const MASKABLE_SCALE = ([\d.]+)/);
	if (!found) throw new Error('src/lib/logo/brand.ts no longer exports MASKABLE_SCALE');
	return Number(found[1]);
})();

const ADAPTIVE_SCALE = (() => {
	const brand = readFileSync(join(ROOT, 'src/lib/logo/brand.ts'), 'utf8');
	const found = brand.match(/export const ADAPTIVE_FOREGROUND_SCALE = ([\d.]+)/);
	if (!found) throw new Error('src/lib/logo/brand.ts no longer exports ADAPTIVE_FOREGROUND_SCALE');
	return Number(found[1]);
})();

/**
 * The languages, and what each of them says.
 *
 * Read straight from `messages/` rather than from the generated catalogue: this
 * runs before a build, node does not speak TypeScript, and the JSON is the
 * thing a translator edits anyway. A `null` is a message nobody has written
 * yet and falls back to the source, as it does in the app.
 */
const LOCALES = (
	readFileSync(join(ROOT, 'src/lib/i18n/locales.ts'), 'utf8').match(
		/export const LOCALES = \[([^\]]+)\]/
	)?.[1] ?? ''
)
	.split(',')
	.map((entry) => entry.trim().replace(/^'|'$/g, ''))
	.filter(Boolean);

const SOURCE_LOCALE = readFileSync(join(ROOT, 'src/lib/i18n/locales.ts'), 'utf8').match(
	/export const SOURCE_LOCALE: Locale = '([^']+)'/
)?.[1];

function catalogueFor(locale) {
	const source = JSON.parse(readFileSync(join(ROOT, `messages/${SOURCE_LOCALE}.json`), 'utf8'));
	const words = JSON.parse(readFileSync(join(ROOT, `messages/${locale}.json`), 'utf8'));
	return Object.fromEntries(Object.keys(source).map((key) => [key, words[key] ?? source[key]]));
}

/** Text that is safe inside an XML element. */
const xml = (value) =>
	String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');

/** The app's one name, everywhere it is written. */
const APP_NAME = 'ontoplano';

/**
 * The accent Android tints a notification with, read rather than repeated.
 *
 * The web side already has the number — a notification the app books goes out
 * with it — and the native ringer posts its own for an instance with a server.
 * Two literals would be two answers to what colour ontoplano is, so the one in
 * `brand.ts` is written into a colour resource here and the Java refers to it.
 */
const NOTIFICATION_ACCENT = (() => {
	const brand = readFileSync(join(ROOT, 'src/lib/logo/brand.ts'), 'utf8');
	const found = brand.match(/export const NOTIFICATION_ACCENT = '(#[0-9a-fA-F]{6})'/);
	if (!found) throw new Error('src/lib/logo/brand.ts no longer exports NOTIFICATION_ACCENT');
	return found[1];
})();

/**
 * Launcher sizes, in the densities Android asks for. Both layers are drawn
 * from the plain icon — the maskable one carries an opaque ground of its own,
 * which would paint over the adaptive background — and each is given the
 * margin its own job needs.
 */
const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

/*
 * The same source at the same size gives the same bytes — on every machine.
 *
 * This was an ImageMagick resize, stripped of its metadata so that re-running
 * it did not rewrite every icon. That much worked; what it could not do is
 * agree with somebody else's ImageMagick, so two people building the same
 * commit produced two different sets and the files flip-flopped between them
 * with every build. `scripts/android-icons.mjs` draws them with the rasteriser
 * the project pins, which makes the bytes a function of the picture and the
 * lockfile.
 */
function resize(source, out, size, scale) {
	writeFileSync(out, squareIcon({ source, size, scale }));
}

if (!existsSync(RES)) {
	console.log('brand: no capacitor android project yet — nothing to brand');
	process.exit(0);
}

const square = join(ROOT, 'static/icons/icon-512.png');
const maskable = join(ROOT, 'static/icons/icon-maskable-512.png');

/*
 * Nothing to do when nothing it reads has moved.
 *
 * Rasterising the launcher icons is the slow part of an Android build and it
 * ran on every one of them, drawing forty-five files from a logo that had not
 * changed since the last release. Refusing to *write* identical bytes — which
 * this already did — saves the disk and not the minute: by then the drawing
 * has happened.
 *
 * The inputs are the two source icons, the shape and brand files the sizes and
 * the field colour come out of, and this script itself, so changing how any of
 * it is drawn draws it again. `FORCE=1` ignores the lot.
 */
const STAMP = join(RES, '.icons-from');
const OUTPUTS = [
	...Object.keys(LAUNCHER).map((density) => join(RES, `mipmap-${density}`, 'ic_launcher.png')),
	// Named too, so deleting the generated resources is enough to get them back.
	join(RES, 'drawable/ic_stat_ontoplano.xml'),
	join(RES, 'values/ontoplano_brand.xml')
];
const work = alreadyDone({
	stamp: STAMP,
	inputs: [
		square,
		maskable,
		join(ROOT, 'src/lib/logo/mark-shape.ts'),
		join(ROOT, 'src/lib/logo/brand.ts'),
		fileURLToPath(import.meta.url),
		{ value: APP_NAME }
	],
	outputs: OUTPUTS
});

if (work.done) {
	console.log('brand: the icons are already drawn from this logo');
	process.exit(0);
}

for (const [density, size] of Object.entries(LAUNCHER)) {
	const dir = join(RES, `mipmap-${density}`);
	mkdirSync(dir, { recursive: true });
	/*
	 * The legacy icon carries its own margin: nothing masks it, and the plain
	 * icon reaches the edges of its own file. See `LEGACY_LAUNCHER_SCALE`.
	 */
	resize(square, join(dir, 'ic_launcher.png'), size, LEGACY_SCALE);
	resize(square, join(dir, 'ic_launcher_round.png'), size, LEGACY_SCALE);
	/*
	 * The foreground layer is the mark and nothing else.
	 *
	 * An adaptive icon is a transparent foreground over a colour, and it used to
	 * be handed the web's maskable icon — which carries an opaque ground of its
	 * own and therefore painted over the colour entirely. The plain icon has no
	 * ground, so the background resource below is what a launcher actually
	 * shows, whatever shape it cuts.
	 *
	 * And at Android's own scale rather than the web's: the foreground is 108dp
	 * of which only 66 are guaranteed, which is what `ADAPTIVE_FOREGROUND_SCALE`
	 * is measured against.
	 */
	writeFileSync(
		join(dir, 'ic_launcher_foreground.png'),
		squareIcon({ source: square, size: FOREGROUND[density], scale: ADAPTIVE_SCALE })
	);
}

/*
 * The adaptive icon's background: the mark's own field.
 *
 * Whatever a launcher masks the icon into — a circle, a squircle, a rounded
 * square — what it cuts is the mark on its own dark, which is what the mark is
 * drawn to sit on. It said this all along and wrote white anyway, so a phone
 * showed the mark on a white tile with the ring's colours floating on nothing.
 *
 * Read from `mark-shape.ts`, where `yarn icons` measures it off the artwork, so
 * a new logo brings its own dark with it rather than leaving a hex here that
 * was right for the last one.
 */
const FIELD = (() => {
	const shape = readFileSync(join(ROOT, 'src/lib/logo/mark-shape.ts'), 'utf8');
	const found = shape.match(/export const MARK_FIELD = '([^']+)'/);
	if (!found) throw new Error('src/lib/logo/mark-shape.ts no longer exports MARK_FIELD');
	return found[1].toUpperCase();
})();

mkdirSync(join(RES, 'values'), { recursive: true });
writeFileSync(
	join(RES, 'values/ic_launcher_background.xml'),
	`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${FIELD}</color>
</resources>
`
);

/*
 * The status-bar icon: one octagon inside the other, in nothing but alpha.
 *
 * Android takes a small icon's alpha channel and throws its colours away, so
 * the launcher icon — which is the whole coloured mark — arrived as a white
 * blob nobody could identify. This is the mark reduced to what that channel
 * can carry: the ring as an outline, the middle as a solid, which is the
 * drawing's own structure and reads at 24dp.
 *
 * A vector rather than five PNGs, because it is two paths and every density
 * then draws it sharp. Generated from `MARK_CLIP_PATH` like everything else,
 * so replacing the logo changes this too.
 */
const NOTIFICATION_ICON_DP = 24;

/** Clear space at the corners, so no launcher's rounding eats the ring. */
const ICON_PADDING_DP = 0.5;
/** How thick the ring is drawn. Thinner than this and it disappears at 24dp. */
const RING_WIDTH_DP = 2;
/**
 * How far an octagon's corners reach past its half width — 1/cos(22.5°).
 * The same arithmetic `brand.ts` uses to fit the mark inside a circle.
 */
const CORNER_REACH = 1.082;

/** The mark's corners at a radius, around a centre, as a vector path. */
/**
 * The mark's own drawing, traced by `yarn icons` into a 24-unit box.
 *
 * Read rather than re-derived: `build-icons.mjs` measures the artwork once and
 * everything else uses its answers, which is the only way the icons and the
 * app agree about what the logo is.
 */
/** The box `build-icons.mjs` writes the traced paths in. */
const TRACE_VIEWBOX = (() => {
	const icons = readFileSync(join(ROOT, 'scripts/build-icons.mjs'), 'utf8');
	const found = icons.match(/const TRACE_VIEWBOX = (\d+)/);
	if (!found) throw new Error('scripts/build-icons.mjs no longer defines TRACE_VIEWBOX');
	return Number(found[1]);
})();

const MARK_DRAWING = (() => {
	/*
	 * Every loop goes into one `pathData`, not one path each: even-odd cuts a
	 * hole where subpaths overlap *within a path*, and the eye as a path of
	 * its own is a filled dot on the bird's face.
	 */
	const shape = readFileSync(join(ROOT, 'src/lib/logo/mark-shape.ts'), 'utf8');
	const listed = /export const MARK_DRAWING = \[([\s\S]*?)\] as const;/.exec(shape);
	if (!listed) throw new Error('src/lib/logo/mark-shape.ts no longer exports MARK_DRAWING');
	return [...listed[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
})();

/**
 * A traced path, moved and scaled from its own 24-unit box into this icon's.
 *
 * The paths are written against the mark's full width; here they have to land
 * inside a ring that was fitted to the icon's padding and stroke, so they are
 * scaled by the ratio of the two and re-centred. Numbers only — every command
 * in them is an M or an L on an absolute point.
 */
function inBox(path, radius, centre) {
	const was = TRACE_VIEWBOX / 2;
	const k = radius / was;
	return path.replace(/([ML])([\d.-]+),([\d.-]+)/g, (_, cmd, x, y) => {
		const at = [centre + (Number(x) - was) * k, centre + (Number(y) - was) * k];
		return `${cmd}${at[0].toFixed(2)},${at[1].toFixed(2)}`;
	});
}

function octagon(radius, centre) {
	return (MARK_OUTLINE.match(/[\d.]+%\s+[\d.]+%/g) ?? [])
		.map((pair, i) => {
			const [x, y] = pair.split(/\s+/).map((n) => parseFloat(n) / 100);
			const at = [centre + (x - 0.5) * 2 * radius, centre + (y - 0.5) * 2 * radius];
			return `${i === 0 ? 'M' : 'L'}${at[0].toFixed(2)},${at[1].toFixed(2)}`;
		})
		.join(' ')
		.concat(' Z');
}

{
	const half = NOTIFICATION_ICON_DP / 2;

	// The widest the ring can be drawn and still have its corners — and the
	// outside of its own stroke — inside the square.
	const ring = (half - ICON_PADDING_DP - RING_WIDTH_DP / 2) / CORNER_REACH;
	// The drawing is placed against the mark's outer edge, which is the far
	// side of the ring, so it stays in proportion however the ring is fitted.
	const outer = ring + RING_WIDTH_DP / 2;

	mkdirSync(join(RES, 'values'), { recursive: true });
	writeFileSync(
		join(RES, 'values/ontoplano_brand.xml'),
		`<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/brand-android.mjs from src/lib/logo/brand.ts. Do not edit. -->
<resources>
    <color name="ontoplano_accent">${NOTIFICATION_ACCENT}</color>
</resources>
`
	);

	mkdirSync(join(RES, 'drawable'), { recursive: true });
	writeFileSync(
		join(RES, 'drawable/ic_stat_ontoplano.xml'),
		`<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/brand-android.mjs from src/lib/logo/mark-shape.ts. Do not edit. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="${NOTIFICATION_ICON_DP}dp"
    android:height="${NOTIFICATION_ICON_DP}dp"
    android:viewportWidth="${NOTIFICATION_ICON_DP}"
    android:viewportHeight="${NOTIFICATION_ICON_DP}">
    <path
        android:pathData="${octagon(ring, half)}"
        android:strokeWidth="${RING_WIDTH_DP}"
        android:strokeColor="#FFFFFFFF"
        android:strokeLineJoin="round" />
    <path
        android:pathData="${MARK_DRAWING.map((d) => inBox(d, outer, half)).join(' ')}"
        android:fillType="evenOdd"
        android:fillColor="#FFFFFFFF" />
</vector>
`
	);
}

/*
 * The reminder channel's name, where a person meets it.
 *
 * Android shows channels in its own settings, under this app, and an unnamed
 * one appears as "Miscellaneous" — which is what somebody would have to hunt
 * through to silence reminders without silencing everything. Written here
 * rather than into the generated `strings.xml`, because `cap sync` owns that
 * file and this is ours.
 */
/*
 * And in every language the app has, in the folders Android reads them from.
 *
 * A channel's name is shown in the system's own settings, outside anything
 * this app draws — so it cannot come from the catalogue at run time the way a
 * screen's words do. It is written into `values-<tag>/` instead, and Android
 * picks the folder matching the phone's language. `pt-BR` is `pt-rBR` there;
 * that spelling is Android's, and it is the only thing this converts.
 *
 * A message nobody has translated yet falls back to the source language, which
 * is exactly what shipping the English does everywhere else.
 */
const androidFolder = (locale) =>
	locale === SOURCE_LOCALE ? 'values' : `values-${locale.replace('-', '-r')}`;

for (const locale of LOCALES) {
	const words = catalogueFor(locale);
	const dir = join(RES, androidFolder(locale));
	mkdirSync(dir, { recursive: true });
	writeFileSync(
		join(dir, 'reminder_strings.xml'),
		`<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/brand-android.mjs. Do not edit. -->
<resources>
    <string name="reminders_channel">${xml(words['android.remindersChannel'])}</string>
    <string name="reminders_channel_what">${xml(words['android.remindersChannelWhat'])}</string>
</resources>
`
	);
}

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

remember(STAMP, work.mark);
