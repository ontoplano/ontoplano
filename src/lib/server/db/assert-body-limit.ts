/**
 * The body Node will read has to be bigger than the picture we accept.
 *
 * `adapter-node` reads `BODY_SIZE_LIMIT` once, at boot, and refuses anything
 * larger with a plain-text 413 — *before* any of this app's code runs. So the
 * refusal never carries a sentence, and a page waiting for a form action's JSON
 * gets an unparseable body and reports an unexplained crash. Somebody uploading
 * a 1.1MB photograph saw `JSON.parse: unexpected character at line 1 column 1`
 * on a 500 page, which named nothing they had done.
 *
 * Worse, the default is 512kB — smaller than the 500kB picture this app is
 * configured to accept once multipart framing is counted. The configured
 * maximum was impossible to upload, and nothing said so.
 *
 * ## Why this warns and clamps rather than refusing to start
 *
 * It threw, once. That was wrong, and it took a staging instance down inside an
 * hour: the unit on the box was written before the variable existed, so the
 * first deploy carrying this check crash-looped an app that had been running
 * perfectly. **A misconfigured ceiling is not a reason to refuse to serve
 * anything at all.** So the two numbers are reconciled instead: whichever is
 * smaller is the ceiling the app actually enforces and advertises, and the log
 * says so once, loudly, with the line to add.
 */

/** `12M`, `512K`, `1048576` — the same spellings adapter-node accepts. */
export function parseByteSize(raw: string | undefined): number | null {
	if (!raw) return null;
	const match = /^(\d+(?:\.\d+)?)\s*([KMG])?B?$/i.exec(raw.trim());
	if (!match) return null;
	const scale = { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[(match[2] ?? '').toUpperCase()] ?? 1;
	return Number(match[1]) * scale;
}

/**
 * Multipart framing, headers and the other fields of the form, over and above
 * the file itself. Generous: being wrong in this direction costs nothing.
 */
const ENVELOPE = 64 * 1024;

/** adapter-node's own default, which is the case this exists for. */
const ADAPTER_DEFAULT = 512 * 1024;

/**
 * The picture ceiling this instance can actually honour.
 *
 * `0` for `BODY_SIZE_LIMIT` disables the limit outright — that is a deliberate
 * answer and it means the configured ceiling stands.
 */
export function pictureCeiling(
	configuredKilobytes: number,
	raw = process.env.BODY_SIZE_LIMIT
): { kilobytes: number; clamped: boolean; limit: number } {
	const parsed = parseByteSize(raw);
	if (parsed === 0) return { kilobytes: configuredKilobytes, clamped: false, limit: 0 };

	const limit = parsed ?? ADAPTER_DEFAULT;
	const room = Math.floor((limit - ENVELOPE) / 1024);
	if (room >= configuredKilobytes) return { kilobytes: configuredKilobytes, clamped: false, limit };

	// Never below something usable: a limit so small that no picture fits is a
	// broken instance either way, and 16KB is this config's own floor.
	return { kilobytes: Math.max(room, 16), clamped: true, limit };
}

/**
 * Say it once, at boot, where somebody running the box will see it.
 *
 * Returns the ceiling in force, so the caller can use the same number the
 * warning talks about.
 */
export function reconcileBodyLimit(
	configuredKilobytes: number,
	raw = process.env.BODY_SIZE_LIMIT,
	say: (message: string) => void = console.warn
): number {
	const { kilobytes, clamped } = pictureCeiling(configuredKilobytes, raw);
	if (!clamped) return kilobytes;

	say(
		`ontoplano: BODY_SIZE_LIMIT is ${raw ?? "unset (adapter-node's 512K default)"}, which is ` +
			`smaller than the ${configuredKilobytes}KB pictures config.toml asks for. Accepting ` +
			`${kilobytes}KB instead — a bigger upload would be refused by the server before this app ` +
			`saw it, with a body no page can read. Add BODY_SIZE_LIMIT=12M to the environment ` +
			`(systemd/ontoplano.service and docker-compose.yml both ship it) and restart, or ` +
			`lower [media] max_kilobytes.`
	);
	return kilobytes;
}
