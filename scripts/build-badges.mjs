/**
 * The README's badges, drawn here instead of fetched from somebody else.
 *
 * They used to come from shields.io: four images the front page of the project
 * could not render without a third party being up, willing, and not counting
 * who looked. A badge says four words. It is not worth an external dependency
 * on the one page every stranger sees first.
 *
 * So they are SVG files in this repo, generated from the list below and
 * checked in. `--check` fails when what is on disk no longer matches, and runs
 * from `make lint` beside `docs:check` — which is what stops the release badge
 * from quietly naming a version that shipped months ago.
 *
 *   node scripts/build-badges.mjs           write them
 *   node scripts/build-badges.mjs --check   fail if what is on disk is stale
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '.github', 'badges');
const CHECK = process.argv.includes('--check');

const BLUE = '#1f6feb';
const SLATE = '#3d444d';
const INK = '#0b1220';

/*
 * How wide a string is, near enough.
 *
 * There are no font metrics here and there cannot be — the file is rendered by
 * whatever GitHub's page has. So the width is estimated per character and the
 * text is centred in it, which is what shields.io does and why its badges are
 * never quite snug either. Wrong by a pixel is invisible; wrong by a lot
 * clips, so the estimate is deliberately generous.
 */
const WIDTHS = { narrow: "iljt.,:;!|'’ ", wide: 'mwMW—·' };
function textWidth(text, size) {
	let units = 0;
	for (const ch of text) {
		if (WIDTHS.narrow.includes(ch)) units += 0.4;
		else if (WIDTHS.wide.includes(ch)) units += 0.95;
		else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) units += 0.72;
		else units += 0.62;
	}
	return Math.ceil(units * size);
}

function escape(text) {
	return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * One badge: a dark label, a coloured value, square corners.
 *
 * Square because everything else in this app is — the rounded pill is a
 * shields.io house style, not a law. `big` is the call to action, which is
 * taller, bolder and spaced out so it reads as something to press.
 */
function badge({ label, value, color = BLUE, big = false }) {
	const size = big ? 12 : 11;
	const height = big ? 32 : 22;
	const pad = big ? 14 : 8;
	const spacing = big ? 0.8 : 0;
	const shown = big ? [label.toUpperCase(), value.toUpperCase()] : [label, value];
	const widths = shown.map((t) => textWidth(t, size) + t.length * spacing + pad * 2);
	const [lw, vw] = widths.map(Math.ceil);
	const total = lw + vw;
	const y = height / 2;
	const font = 'Verdana,DejaVu Sans,Geneva,sans-serif';

	// `text-anchor: middle` at the centre of each half, so an estimate that is
	// a little out is a little off-centre rather than off the end.
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="${height}" role="img" aria-label="${escape(
		`${label}: ${value}`
	)}">
<title>${escape(`${label}: ${value}`)}</title>
<rect width="${lw}" height="${height}" fill="${INK}"/>
<rect x="${lw}" width="${vw}" height="${height}" fill="${color}"/>
<g fill="#ffffff" font-family="${font}" font-size="${size}"${
		big ? ' font-weight="bold" letter-spacing="0.8"' : ''
	} text-anchor="middle">
<text x="${lw / 2}" y="${y}" dominant-baseline="central" fill="#c9d1d9">${escape(shown[0])}</text>
<text x="${lw + vw / 2}" y="${y}" dominant-baseline="central">${escape(shown[1])}</text>
</g>
</svg>
`;
}

const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const BADGES = {
	// The one thing a stranger should press, and what it costs to press it.
	'try-the-demo': badge({ label: 'try the demo', value: 'no sign up necessary', big: true }),
	release: badge({ label: 'release', value: `v${version}` }),
	licence: badge({ label: 'licence', value: 'AGPL-3.0' }),
	'host-it': badge({ label: 'host it', value: 'yourself', color: SLATE })
};

mkdirSync(OUT, { recursive: true });

let stale = 0;
for (const [name, svg] of Object.entries(BADGES)) {
	const path = join(OUT, `${name}.svg`);
	const current = existsSync(path) ? readFileSync(path, 'utf8') : null;
	if (current === svg) continue;
	if (CHECK) {
		console.error(`badges: ${name}.svg is stale — run \`make badges\``);
		stale++;
		continue;
	}
	writeFileSync(path, svg);
}

if (CHECK) {
	if (stale > 0) process.exit(1);
	console.log('badges: up to date');
} else {
	console.log(`badges: wrote ${Object.keys(BADGES).length} to .github/badges/`);
}
