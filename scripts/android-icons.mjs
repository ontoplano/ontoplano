/**
 * The launcher icons, drawn the same way on every machine.
 *
 * These used to be ImageMagick resizes, with `-strip` and the date chunks
 * excluded so that re-running produced the same bytes. It does — on one
 * machine. Two people building the same commit got two different sets, because
 * their `magick` binaries differ, and the forty-five files then flip back and
 * forth with every build: two "chore: android images" commits in one morning,
 * each undoing the other.
 *
 * So the drawing is done by the rasteriser the project already pins in
 * `package.json` — the one `yarn icons` uses — and the bytes are a function of
 * the source picture and the lockfile rather than of whatever is installed.
 * That is also what F-Droid means by a reproducible build: it builds the
 * committed project, and a committed asset nobody can reproduce is one nobody
 * can check.
 *
 * Every icon is the same shape: one square picture, centred, at some fraction
 * of the output. So there is one function, and the callers differ only in what
 * they pass it.
 */
import { readFileSync } from 'node:fs';

/*
 * The pinned rasteriser, or nothing.
 *
 * `scripts/build-icons.mjs` falls back to whatever is installed when this is
 * missing, because a wrong-looking favicon is better than no favicon. Here the
 * opposite holds: a second rasteriser writes different bytes, which is the
 * whole failure this module exists to end, so a missing one is worth stopping
 * for rather than quietly working around.
 */
const { Resvg } = await import('@resvg/resvg-js').catch(() => {
	throw new Error(
		'@resvg/resvg-js is not installed — run yarn install.\n' +
			'The launcher icons are drawn with the version this project pins, so that two\n' +
			'people building the same commit write the same files.'
	);
});

/**
 * A square PNG of `source`, scaled to `scale` of the width and centred.
 *
 * `scale` is 1 for the plain launcher icon — the picture fills the square —
 * and less for an adaptive foreground, where the margin is the thing being
 * asked for. The ground is left transparent: the adaptive icon's background is
 * a colour resource, and the plain icon is drawn on whatever the launcher puts
 * behind it.
 */
export function squareIcon({ source, size, scale = 1 }) {
	const picture = readFileSync(source).toString('base64');
	const side = size * scale;
	const at = (size - side) / 2;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <image x="${at}" y="${at}" width="${side}" height="${side}" preserveAspectRatio="xMidYMid meet" xlink:href="data:image/png;base64,${picture}"/>
</svg>
`;

	return new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
}
