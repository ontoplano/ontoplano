/**
 * The content hash a picture is deduplicated by.
 *
 * WebCrypto rather than `node:crypto`, because this runs in both worlds: on
 * the server, and inside the worker that is the whole instance on a phone,
 * where there is no Node at all. `crypto.subtle` is the one digest both of
 * them have — which makes it asynchronous, and that is why `store` is.
 *
 * It is a fingerprint, not a secret: the same bytes must reach the same
 * string on every instance, so an export taken from a server and opened on a
 * phone still knows that two rows are one picture.
 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
	/*
	 * Copied through the constructor, never `.slice().buffer`.
	 *
	 * Node's `Buffer.slice` is an alias for `subarray` — a view — and small
	 * Buffers are carved out of a shared 8KB pool, so `.buffer` there is the
	 * pool and every picture under 4KB hashes to the same thing. That silently
	 * turns deduplication into "every small picture is the same picture".
	 * `new Uint8Array(bytes)` copies exactly these bytes, Buffer or not.
	 */
	const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
