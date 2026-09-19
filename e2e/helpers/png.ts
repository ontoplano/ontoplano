import { deflateSync } from 'node:zlib';

/**
 * A real PNG, built here rather than committed as a fixture.
 *
 * Several suites need a file the app will actually accept — the upload is
 * refused unless the bytes decode — and a checked-in binary is a thing nobody
 * can read in a diff. Three copies of this function had grown across the
 * suite; this is the one.
 *
 * The colour is what makes two of them different files. The store keys on the
 * hash of the bytes, so uploading the same picture twice is one row and two
 * references, which is right and is also how a test meaning to make two
 * pictures quietly makes one.
 */
export type Upload = { name: string; mimeType: string; buffer: Buffer };

export function png(colour: [number, number, number]): Upload {
	const buffer = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header(1, 1)),
		chunk('IDAT', deflateSync(Buffer.from([0, ...colour]))),
		chunk('IEND', Buffer.alloc(0))
	]);
	return { name: `dot-${colour.join('-')}.png`, mimeType: 'image/png', buffer };
}

/**
 * A square one, padded to a given size with incompressible noise.
 *
 * For the tests about refusing a file that is too big. The padding sits after
 * IEND, so it is still a PNG any decoder reads — and the length the browser
 * and the server both count is the file's.
 */
export function pngOfSize(size: number, kilobytes: number): Upload {
	const rows = Buffer.concat(
		Array.from({ length: size }, () =>
			Buffer.concat([
				Buffer.from([0]),
				Buffer.concat(Array.from({ length: size }, () => Buffer.from([7, 9, 11])))
			])
		)
	);
	const real = Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header(size, size)),
		chunk('IDAT', deflateSync(rows)),
		chunk('IEND', Buffer.alloc(0))
	]);

	const wanted = kilobytes * 1024;
	if (real.length >= wanted) return { name: 'big.png', mimeType: 'image/png', buffer: real };
	const noise = Buffer.alloc(wanted - real.length);
	for (let i = 0; i < noise.length; i++) noise[i] = (i * 37) % 251;
	return { name: 'big.png', mimeType: 'image/png', buffer: Buffer.concat([real, noise]) };
}

const TABLE = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});

function crc(buf: Buffer): number {
	let c = 0xffffffff;
	for (const byte of buf) c = TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
	const check = Buffer.alloc(4);
	check.writeUInt32BE(crc(body));
	return Buffer.concat([length, body, check]);
}

/** Width, height, 8 bits a channel, truecolour. */
function header(width: number, height: number): Buffer {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	return ihdr;
}
