/**
 * The one place a version string becomes Android's `versionCode`.
 *
 * 0.178.1 is 17801, 1.2.3 is 100203. The major's factor is 100000, and it is
 * not negotiable downwards: a phone refuses an app whose code is lower than
 * the one it holds, so 1.0.0 has to land above every 0.x that ever shipped.
 * This used to live in two scripts with two factors — the builder wrote
 * 1.0.0 as 10000, the check expected 100203-shaped numbers — and the
 * disagreement was invisible for exactly as long as the major stayed 0.
 *
 * It throws rather than wrapping. A patch of 100 wears the next minor's code,
 * Play refuses an upload whose code it has seen, and that collision should
 * surface here — at build time, by name — not on the console during a
 * release. When a part genuinely needs to pass its ceiling, bump the part
 * above it; if the numbering itself has to be rethought, decouple the code
 * into a counter of its own first.
 *
 * @param {string} version
 * @returns {number}
 */
export function versionCode(version) {
	const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!parts) throw new Error(`"${version}" is not a major.minor.patch version`);
	const [major, minor, patch] = parts.slice(1).map(Number);
	if (patch > 99) {
		throw new Error(
			`${version} would wear the same versionCode as ${major}.${minor + 1}.${patch - 100} — bump the minor instead of a patch past 99`
		);
	}
	if (minor > 999) {
		throw new Error(
			`${version} would wear the same versionCode as ${major + 1}.${minor - 1000}.${patch} — bump the major instead of a minor past 999`
		);
	}
	return major * 100000 + minor * 100 + patch;
}
