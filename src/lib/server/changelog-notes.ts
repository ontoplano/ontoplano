/**
 * What the mailing list has not heard yet, read out of `CHANGELOG.md`.
 *
 * A patch goes out most days and a mail per patch is a list nobody stays on,
 * so the release mail is everything since the last one that went: this
 * version's lines and every version's below it, down to the newest one
 * already announced. The first mail of all carries this version alone rather
 * than the whole history.
 */

/** `## 0.185.2 — 2026-10-03`, as the changelog check enforces. */
const HEADING = /^## (\d+\.\d+\.\d+) — /m;

/** One version's bullets, as plain sentences: the mail is plain text. */
function bulletsOf(body: string): string[] {
	return body
		.split('\n- ')
		.slice(1)
		.map((bullet) =>
			bullet
				.replace(/\*\*/g, '')
				.replace(/`/g, '')
				.split('\n')
				.map((line) => line.trim())
				.join(' ')
				.trim()
		)
		.filter(Boolean);
}

/** Every version in the changelog with its bullets, newest first. */
export function changelogSections(changelog: string): { version: string; lines: string[] }[] {
	const parts = changelog.split(/\n(?=## \d+\.\d+\.\d+ — )/);
	return parts.flatMap((part) => {
		const heading = HEADING.exec(part);
		if (!heading || part.indexOf(heading[0]) !== 0) return [];
		const end = part.indexOf('\n## ', 1);
		return [{ version: heading[1], lines: bulletsOf(end < 0 ? part : part.slice(0, end)) }];
	});
}

/**
 * The lines to send for `version`, and which versions they come from.
 *
 * Throws when the changelog has no entry for it — a release mail with no
 * notes is a mail not worth sending.
 */
export function notesSince(
	changelog: string,
	version: string,
	announced: readonly string[]
): { versions: string[]; lines: string[] } {
	const sections = changelogSections(changelog);
	const from = sections.findIndex((one) => one.version === version);
	if (from < 0) throw new Error(`CHANGELOG.md has no entry for ${version}`);

	const taken = announced.length === 0 ? [sections[from]] : [];
	if (announced.length > 0)
		for (const one of sections.slice(from)) {
			if (announced.includes(one.version)) break;
			taken.push(one);
		}
	return { versions: taken.map((one) => one.version), lines: taken.flatMap((one) => one.lines) };
}
