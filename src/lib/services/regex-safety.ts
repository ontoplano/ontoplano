/**
 * Patterns somebody types, and the ones that never finish.
 *
 * A finance rule is a regular expression written by a person and then run
 * against every line of every statement, on the server, every time a page is
 * drawn. JavaScript's engine backtracks, so a pattern like `(a+)+$` takes
 * exponential time on an input that nearly matches: a few dozen characters is
 * already longer than the heat death of the sun, and there is no way to
 * interrupt a running match — it holds the whole process, which on a shared
 * instance means everybody's.
 *
 * The engine gives no timeout, so the check has to happen before the pattern
 * is ever run. What makes a pattern explode is always the same shape: a
 * repetition wrapped in another repetition, where the inner one can match the
 * same text in more than one way. That is what is looked for here, plus the
 * two other things that cost more than they are worth — backreferences, which
 * force the backtracking engine, and counted repetitions with enormous counts.
 *
 * This refuses some patterns that would in fact have been fine. That is the
 * right direction to be wrong in: the answer names the shape and the person
 * writes `[a-z]+` instead of `(a+)+`, which is what they meant anyway.
 */

/** The most a `{n,m}` may ask for before it is a denial of service in itself. */
export const MAX_REPETITION = 1000;

/** Characters a first-set is tested against. Enough to catch real overlap. */
const SAMPLES = ['a', 'z', 'A', 'Z', '0', '9', ' ', '-', '_', '.', '/', '@'];

/** An unbounded quantifier: the ones that can repeat without end. */
const UNBOUNDED = /^(?:[*+]|\{\d+,\})/;

/**
 * Why this pattern must not be run, or null if it may be.
 *
 * The reason is a sentence for whoever typed it, not a diagnostic.
 */
export function unsafePattern(pattern: string): string | null {
	if (/\\\d/.test(pattern) || /\\k<[^>]+>/.test(pattern))
		return 'A backreference (\\1, \\k<name>) can take exponential time to match. Write the text out instead.';

	for (const match of pattern.matchAll(/\{(\d+)(?:,(\d+)?)?\}/g)) {
		const most =
			match[2] === undefined && match[0].includes(',') ? Infinity : Number(match[2] ?? match[1]);
		if (Number(match[1]) > MAX_REPETITION || most > MAX_REPETITION)
			return `A repetition of more than ${MAX_REPETITION} is refused — it costs more than it can find.`;
	}

	for (const group of groups(pattern)) {
		if (!UNBOUNDED.test(pattern.slice(group.end + 1))) continue;
		const body = pattern
			.slice(group.start + 1, group.end)
			.replace(/^\?(?:[:=!>]|<[=!]|<[^>]*>)/, '');
		if (repeats(body))
			return 'A repetition inside a repetition — like (a+)+ — can take exponential time to match. Repeat the inner part alone.';
		if (overlappingBranches(body))
			return 'A repeated choice whose options start alike — like (a|ab)+ — can take exponential time to match. Make the options start differently.';
	}

	return null;
}

/** Every group in the pattern, as the span between its parentheses. */
function groups(pattern: string): { start: number; end: number }[] {
	const open: number[] = [];
	const found: { start: number; end: number }[] = [];
	let inClass = false;

	for (let i = 0; i < pattern.length; i++) {
		const c = pattern[i];
		if (c === '\\') {
			i += 1;
			continue;
		}
		if (inClass) {
			if (c === ']') inClass = false;
			continue;
		}
		if (c === '[') inClass = true;
		else if (c === '(') open.push(i);
		else if (c === ')') {
			const start = open.pop();
			if (start !== undefined) found.push({ start, end: i });
		}
	}
	return found;
}

/** Does this body contain a repetition of its own, at any depth? */
function repeats(body: string): boolean {
	let inClass = false;
	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === '\\') {
			i += 1;
			continue;
		}
		if (inClass) {
			if (c === ']') inClass = false;
			continue;
		}
		if (c === '[') inClass = true;
		else if (UNBOUNDED.test(body.slice(i))) return true;
	}
	return false;
}

/**
 * Do two of this body's top-level choices accept the same first character?
 *
 * `(cat|dog)+` is harmless — a c is a cat and a d is a dog, and the engine
 * never has to reconsider. `(a|ab)+` is not: every a is two readings, and n
 * of them are 2^n. Rather than reason about it, the first thing each branch
 * can match is compiled on its own and tried against a handful of ordinary
 * characters; a branch whose first thing is itself a group is treated as
 * matching anything, which is the cautious answer.
 */
function overlappingBranches(body: string): boolean {
	const branches = topLevelSplit(body);
	if (branches.length < 2) return false;

	const sets = branches.map((branch) => {
		const atom = firstAtom(branch);
		if (atom === null) return new Set(SAMPLES);
		try {
			const re = new RegExp(`^(?:${atom})`, 'i');
			return new Set(SAMPLES.filter((s) => re.test(s)));
		} catch {
			return new Set(SAMPLES);
		}
	});

	for (let i = 0; i < sets.length; i++)
		for (let j = i + 1; j < sets.length; j++)
			for (const s of sets[i]) if (sets[j].has(s)) return true;
	return false;
}

/** The body's choices, split on the `|`s that are not inside anything. */
function topLevelSplit(body: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let inClass = false;
	let start = 0;

	for (let i = 0; i < body.length; i++) {
		const c = body[i];
		if (c === '\\') {
			i += 1;
			continue;
		}
		if (inClass) {
			if (c === ']') inClass = false;
			continue;
		}
		if (c === '[') inClass = true;
		else if (c === '(') depth += 1;
		else if (c === ')') depth -= 1;
		else if (c === '|' && depth === 0) {
			out.push(body.slice(start, i));
			start = i + 1;
		}
	}
	out.push(body.slice(start));
	return out;
}

/** The first thing a branch can match, or null when that is a group. */
function firstAtom(branch: string): string | null {
	if (branch.length === 0) return null;
	// Anchors and lookarounds match no character; what follows is the first thing.
	const skipped = branch.replace(/^\^+/, '');
	const c = skipped[0];
	if (c === undefined || c === '(') return null;
	if (c === '\\') return skipped.slice(0, 2);
	if (c === '[') {
		const end = closingClass(skipped);
		return end === -1 ? null : skipped.slice(0, end + 1);
	}
	if (c === '.') return '.';
	return c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function closingClass(s: string): number {
	for (let i = 1; i < s.length; i++) {
		if (s[i] === '\\') i += 1;
		else if (s[i] === ']' && i > 1) return i;
	}
	return -1;
}
