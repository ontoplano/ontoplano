/**
 * The two pieces of Node's `Buffer` that Drizzle's blob column insists on.
 *
 * A `blob` column declared `mode: 'buffer'` maps every value it reads with
 * `Buffer.isBuffer(value) ? value : Buffer.from(value)` — unconditionally, with
 * no browser branch. In a worker that is a `ReferenceError` the first time a
 * picture is read back, which is exactly where the gallery on a device died.
 *
 * The alternative would be declaring the column differently, but the column
 * belongs to the schema both instances share, and the server's rows really are
 * Buffers. So the device gets a stand-in instead: a `Uint8Array` is what
 * `Buffer.from` returns here, which is what a Buffer is anyway once the Node
 * conveniences are gone — and the only thing anything does with these bytes is
 * hand them back to SQLite or to an `<img>`.
 *
 * Deliberately tiny. If something on the device ever needs `Buffer.concat` or
 * `.toString('base64')`, the honest answer is to stop using `Buffer` there
 * rather than to grow this.
 */
const standIn = {
	isBuffer: (value: unknown): boolean => value instanceof Uint8Array,
	from: (value: ArrayBuffer | ArrayBufferView | number[] | string): Uint8Array => {
		if (typeof value === 'string') return new TextEncoder().encode(value);
		if (value instanceof ArrayBuffer) return new Uint8Array(value);
		if (ArrayBuffer.isView(value))
			return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
		return new Uint8Array(value);
	}
};

/** Install it, once, if the runtime has no Buffer of its own. */
export function installBufferStandIn(): void {
	const global = globalThis as unknown as { Buffer?: unknown };
	if (global.Buffer === undefined) global.Buffer = standIn;
}
