#!/usr/bin/env node
/**
 * The pictures the demo and the development seed put into an account.
 *
 *   yarn demo-media           # rebuild them from the source images
 *   yarn demo-media --check   # fail if what is committed is out of date
 *
 * ## Why there are real pictures in here at all
 *
 * The seed used to make a solid square of one colour and call it a picture.
 * It was a picture in the sense that the bytes were a valid PNG, and in no
 * other: somebody opening the demo saw a beige rectangle under a note about a
 * trip and a blue one where a person's face should be, which reads as a broken
 * feature rather than a seeded one. A demo is a claim about what the app looks
 * like when it is being used, and nobody's recipes are lit rectangles.
 *
 * ## Where they come from
 *
 * The Metropolitan Museum of Art's Open Access collection, which publishes
 * these under **CC0** — no attribution required, no licence to propagate, and
 * unambiguous about it, which matters in a repository other people copy.
 * `SOURCES.md` beside the output records exactly which object each one is.
 *
 * The faces are the exception, and they are generated: nobody here is a
 * photograph of a real person. A stock photograph carries a model release
 * nobody in this repository can check, and the 19th-century portrait
 * photography in these collections is largely of people who did not choose to
 * be photographed — using either as decoration for a made-up contact called
 * Ana is not something to do by accident. They were paintings for that reason
 * until somebody pointed out that a painting on the people page reads as a
 * museum rather than as an address book. Their originals sit in
 * `scripts/demo-media-src/`, so a rebuild needs no network for them.
 *
 * ## What this does to them
 *
 * Downloads the small web image, crops it to the shape the app will show it in
 * — a person's picture is drawn in a circle, a recipe's on a square card — and
 * writes a JPEG small enough to sit under any instance's upload ceiling. The
 * crops are here rather than left to `object-cover` because centring a portrait
 * on the middle of its canvas usually cuts the head off.
 *
 * JPEG rather than PNG because these are photographs of paintings: the same
 * crop is 500kB as a PNG and 60kB as a JPEG, and 500kB is the default ceiling
 * an instance puts on an upload, so the PNG version arrived at the demo as a
 * picture the demo's own app would have refused.
 */
import { Resvg } from '@resvg/resvg-js';
import jpeg from 'jpeg-js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'demo-media');
/** Originals that are not the museum's, kept so a rebuild is offline for them. */
const SRC = join(dirname(fileURLToPath(import.meta.url)), 'demo-media-src');
const API = 'https://collectionapi.metmuseum.org/public/collection/v1/objects';

/**
 * What to make, from what.
 *
 * `crop` is a rectangle in fractions of the source image — 0,0 is its top left
 * corner and 1,1 its bottom right — so a change to which size the museum serves
 * does not move the crop.
 */
const PICTURES = [
	{
		out: 'ana.jpg',
		file: 'ana.png',
		credit: 'generated, not a photograph of anybody',
		what: "the picture on a person's card, drawn in a circle",
		width: 320,
		height: 320,
		crop: { x: 0.16, y: 0.16, w: 0.56, h: 0.56 }
	},
	{
		out: 'kitchen.jpg',
		object: 437703,
		what: 'a picture inside a note, drawn at the width of the writing',
		width: 640,
		height: 440,
		crop: { x: 0.0, y: 0.34, w: 0.8, h: 0.66 }
	},
	{
		out: 'joao.jpg',
		file: 'joao.png',
		credit: 'generated, not a photograph of anybody',
		what: "a friend's picture on the people page",
		width: 320,
		height: 320,
		crop: { x: 0.34, y: 0.1, w: 0.54, h: 0.54 }
	},
	{
		out: 'marco.jpg',
		file: 'marco.png',
		credit: 'generated, not a photograph of anybody',
		what: "a colleague's picture on the people page",
		width: 320,
		height: 320,
		crop: { x: 0.22, y: 0.05, w: 0.52, h: 0.52 }
	},
	{
		out: 'mum.jpg',
		file: 'mum.png',
		credit: 'generated, not a photograph of anybody',
		what: "a mother's picture on the people page",
		width: 320,
		height: 320,
		crop: { x: 0.18, y: 0.08, w: 0.46, h: 0.46 }
	},
	{
		out: 'horse.jpg',
		// Rosa Bonheur's The Horse Fair — the Met's, CC0 like everything else
		// here, and a real horse at last.
		object: 435702,
		what: 'a picture inside a note, drawn at the width of the writing',
		width: 640,
		height: 440,
		crop: { x: 0.36, y: 0.2, w: 0.42, h: 0.57 }
	},
	/*
	 * The four notebook covers.
	 *
	 * Photographs rather than paintings, which is the one thing a cover must
	 * not be: a shelf of framed oils reads as a museum catalogue, and a
	 * notebook is a subject somebody is working on. Portrait, because the
	 * cover is drawn at 3:4 — the shape of a book on a shelf.
	 */
	{
		out: 'cover-kitchen.jpg',
		object: 289171,
		what: "the renovation notebook's cover",
		width: 480,
		height: 640,
		crop: { x: 0.18, y: 0.0, w: 0.6, h: 1.0 }
	},
	{
		out: 'cover-portugal.jpg',
		object: 267019,
		what: "the trip notebook's cover",
		width: 480,
		height: 640,
		crop: { x: 0.2, y: 0.0, w: 0.56, h: 1.0 }
	},
	{
		out: 'cover-reading.jpg',
		object: 283103,
		what: "the reading notebook's cover",
		width: 480,
		height: 640,
		crop: { x: 0.24, y: 0.0, w: 0.5, h: 1.0 }
	},
	{
		out: 'cover-republic.jpg',
		object: 283133,
		what: "the Republic notebook's cover",
		width: 480,
		height: 640,
		crop: { x: 0.12, y: 0.0, w: 0.72, h: 1.0 }
	},
	{
		out: 'tomato-pasta.jpg',
		object: 816624,
		what: "a recipe's main picture, drawn on a square card",
		width: 480,
		height: 480,
		crop: { x: 0.14, y: 0.02, w: 0.72, h: 0.96 }
	}
];

/**
 * How big a source image is, whichever kind it is.
 *
 * The museum serves JPEG and the faces beside this script are PNG, and the
 * crop is a fraction of the source — so the one thing this needs from either
 * is its width and height.
 */
function sizeOf(bytes) {
	// PNG: the IHDR is the first chunk and its first eight bytes are the size.
	if (bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
		return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
	}
	return sizeOfJpeg(bytes);
}

/** The type a data URI has to name for the renderer to decode it. */
const mimeOf = (bytes) => (bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png' : 'image/jpeg');

/** A JPEG's dimensions, from its start-of-frame marker. */
function sizeOfJpeg(bytes) {
	let at = 2;
	while (at < bytes.length) {
		if (bytes[at] !== 0xff) {
			at += 1;
			continue;
		}
		const marker = bytes[at + 1];
		if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
			return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
		}
		at += 2 + bytes.readUInt16BE(at + 2);
	}
	throw new Error('not a JPEG this can read');
}

async function met(object) {
	const meta = await fetch(`${API}/${object}`).then((r) => r.json());
	if (!meta.isPublicDomain) {
		// The whole reason these are usable. If one ever stops being CC0, this
		// stops rather than quietly shipping it.
		throw new Error(`Met object ${object} is not public domain — refusing to use it`);
	}
	const bytes = Buffer.from(await fetch(meta.primaryImageSmall).then((r) => r.arrayBuffer()));
	return { meta, bytes };
}

function render(bytes, { width, height, crop }) {
	const source = sizeOf(bytes);
	// The scale that makes the cropped region exactly as wide as the output.
	const scale = width / (crop.w * source.width);
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
		`viewBox="0 0 ${width} ${height}">` +
		`<image href="data:${mimeOf(bytes)};base64,${bytes.toString('base64')}" ` +
		`x="${-crop.x * source.width * scale}" y="${-crop.y * source.height * scale}" ` +
		`width="${source.width * scale}" height="${source.height * scale}" />` +
		`</svg>`;
	const drawn = new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render();
	// 82: the point where these stop getting visibly better and keep getting
	// bigger. resvg hands back straight RGBA, so nothing is encoded twice.
	return jpeg.encode({ data: drawn.pixels, width: drawn.width, height: drawn.height }, 82).data;
}

const checking = process.argv.includes('--check');
mkdirSync(OUT, { recursive: true });

const rows = [];
let stale = 0;

for (const picture of PICTURES) {
	const path = join(OUT, picture.out);

	if (checking && existsSync(path)) {
		// Only that it exists. Re-downloading three museum images on every lint
		// would make the check need a network and the museum need the traffic.
		rows.push(picture.out);
		continue;
	}
	if (checking) {
		console.error(`${picture.out} is missing — run: yarn demo-media`);
		stale += 1;
		continue;
	}

	const { meta, bytes } = picture.file
		? {
				meta: { title: picture.what, objectURL: null, artistDisplayName: null },
				bytes: readFileSync(join(SRC, picture.file))
			}
		: await met(picture.object);
	const image = render(bytes, picture);
	writeFileSync(path, image);
	console.log(`${picture.out}  ${Math.round(image.length / 1024)}KB  ← ${meta.title}`);

	rows.push(
		picture.file
			? `| \`${picture.out}\` | ${picture.what} | ${picture.credit ?? "Estevão's own photograph"} | this project's |`
			: `| \`${picture.out}\` | [${meta.title}](${meta.objectURL}) | ` +
					`${meta.artistDisplayName || 'Unknown'}, ${meta.objectDate} | CC0 |`
	);
}

if (checking) process.exit(stale ? 1 : 0);

writeFileSync(
	join(OUT, 'SOURCES.md'),
	`# Where the demo's pictures come from

The faces are generated — nobody in this repository is a photograph of a real
person, which is the only honest way to put a face on a made-up contact called
Ana. Their originals are \`scripts/demo-media-src/\`, committed so a rebuild
needs nothing but this checkout.

Everything else is from the Metropolitan Museum of Art's Open Access
collection, released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/):
no attribution is required and nothing is asked of anybody who copies this
repository. They are listed anyway, because a file whose provenance is not
written down is one nobody can check.

\`yarn demo-media\` rebuilds them from \`scripts/build-demo-media.mjs\`, which
also holds the crops and the reason there are pictures here at all.

| file | work | by | licence |
| --- | --- | --- | --- |
${rows.join('\n')}
`
);
console.log('SOURCES.md');
