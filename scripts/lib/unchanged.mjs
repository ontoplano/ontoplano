/**
 * Work skipped because nothing it reads has changed.
 *
 * Drawing the Android icons is a couple of seconds on a fast machine and
 * closer to two minutes on a slow one, and it is done on every build —
 * including the overwhelming majority where the logo has not moved in weeks.
 * The scripts already refuse to *write* a file whose bytes are identical, which
 * keeps the tree clean and saves nothing at all: the cost is in the drawing,
 * which has already happened by the time there is anything to compare.
 *
 * So: hash everything the work depends on, keep the hash beside the outputs,
 * and when it matches and the outputs are still there, do not start.
 *
 * What counts as a dependency is the caller's to say, and getting it wrong in
 * the careless direction is the dangerous one — a stamp that misses an input
 * is a build that quietly ships yesterday's icons. Two habits make that
 * unlikely: name the script's own source as an input, so changing how the work
 * is done invalidates it; and when in doubt include the file rather than
 * reasoning about whether it could matter.
 *
 * `FORCE=1` in the environment ignores all of it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A hash of everything given: file paths are read, anything else is stringified.
 *
 * A path that does not exist contributes its absence rather than throwing —
 * "the file is not there" is a state worth telling apart from "the file is
 * empty", and an input that appears later has to invalidate the stamp.
 *
 * @param {(string | { path: string } | { value: unknown })[]} parts
 * @returns {string}
 */
export function fingerprint(parts) {
	const hash = createHash('sha256');
	for (const part of parts) {
		if (typeof part === 'string') {
			hash.update('path:', 'utf8');
			hash.update(part, 'utf8');
			hash.update(existsSync(part) ? readFileSync(part) : Buffer.from('<missing>'));
		} else if ('path' in part) {
			hash.update('path:', 'utf8');
			hash.update(part.path, 'utf8');
			hash.update(existsSync(part.path) ? readFileSync(part.path) : Buffer.from('<missing>'));
		} else {
			hash.update('value:', 'utf8');
			hash.update(String(part.value), 'utf8');
		}
	}
	return hash.digest('hex');
}

/**
 * Is the work already done?
 *
 * True only when the stamp matches AND every output it claims to have written
 * is still on disk — a stamp on its own would skip the work for somebody who
 * deleted the outputs, which is exactly what deleting them was meant to undo.
 *
 * @param {{ stamp: string, inputs: (string | { path: string } | { value: unknown })[], outputs: string[] }} work
 * @returns {{ done: boolean, mark: string }}
 */
export function alreadyDone({ stamp, inputs, outputs }) {
	const mark = fingerprint(inputs);
	if (process.env.FORCE === '1') return { done: false, mark };
	if (!existsSync(stamp)) return { done: false, mark };
	if (readFileSync(stamp, 'utf8').trim() !== mark) return { done: false, mark };
	for (const out of outputs) if (!existsSync(out)) return { done: false, mark };
	return { done: true, mark };
}

/** Remember that this exact set of inputs produced the outputs on disk.
 *  @param {string} stamp
 *  @param {string} mark */
export function remember(stamp, mark) {
	mkdirSync(dirname(stamp), { recursive: true });
	writeFileSync(stamp, `${mark}\n`);
}
