/**
 * Whether a thing can be sent to this instance at all, and what to say if not.
 *
 * `adapter-node` refuses a body larger than `BODY_SIZE_LIMIT` with a plain 413
 * before any of this app's code runs — no page, no sentence, and for a form
 * action a body the page cannot parse. What that looked like from outside was
 * a 500 and "something went wrong on our side" on a 16MB account export
 * against a 12MB ceiling, which named nothing anybody had done.
 *
 * So the size is decided here, before anything is sent, and the answer carries
 * both numbers. Shared because two paths reach it — choosing a file and
 * pasting into the box — and they used to disagree: choosing was held to two
 * megabytes and left the box empty when it refused, so the form posted nothing
 * and the server said "that file is not JSON", which was true of the empty
 * string and true of nothing else.
 */

/** `16.3MB`, the way a person writes it. */
export function inMegabytes(bytes: number): string {
	return `${(bytes / 1_000_000).toFixed(1)}MB`;
}

/**
 * `null` when it fits. A ceiling of `0` means the instance set none, which is
 * a deliberate answer and not a mistake.
 */
export function tooBigToSend(bytes: number, ceiling: number): string | null {
	if (ceiling <= 0 || bytes <= ceiling) return null;

	return (
		`That is ${inMegabytes(bytes)}, and this instance accepts ${inMegabytes(ceiling)}. ` +
		'Whoever runs it can raise BODY_SIZE_LIMIT and restart; on the machine itself, ' +
		'`make db-import` has no such ceiling.'
	);
}
