/**
 * What a release is called, in the one place that decides it.
 *
 * Three things have to agree about the name of a `.deb`: the script that
 * builds it, the recipe that attaches it, and the documentation that tells
 * somebody to download it. They did not — the docs said
 * `ontoplano_amd64.deb` and the file has always been `ontoplano_0.131.0_amd64.deb`,
 * so the first command on the install page had been a 404 for as long as
 * anybody had been reading it. Nothing could have caught that, because no two
 * of those three places shared a line of code.
 *
 * Now they share this one.
 */
import { execFileSync, execFileSync as exec } from 'node:child_process';
import { readFileSync } from 'node:fs';

const PKG = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

/**
 * Where the releases are, from the repository this package declares.
 *
 * Read rather than written, so a fork gets its own and nobody has to remember
 * that this string exists.
 */
export const REPO = String(PKG.repository?.url ?? '')
	.replace(/^git\+/, '')
	.replace(/\.git$/, '');

/** Every file a release attaches, named for one version. */
export function assetNames(version) {
	return {
		deb: `ontoplano_${version}_amd64.deb`,
		rpm: `ontoplano-${version}-1.x86_64.rpm`,
		tarball: `ontoplano-${version}.tar.gz`,
		sums: 'SHA256SUMS'
	};
}

/** The address one of them is downloaded from, for a given tag. */
export function downloadUrl(tag, name) {
	return `${REPO}/releases/download/${tag}/${name}`;
}

/**
 * The newest release, or null where that cannot be known.
 *
 * The same three answers `build-badges.mjs` uses, and for the same reasons.
 * `RELEASE_TAG` is how the release cut gets ahead of itself: the docs have to
 * be inside the commit the tag lands on, and at the moment they are written
 * the tag does not exist yet. A shallow clone — which is what CI has — carries
 * no tags at all, and gets null rather than a wrong answer.
 */
export function releaseTag() {
	if (process.env.RELEASE_TAG) return process.env.RELEASE_TAG;

	try {
		return exec('git', ['describe', '--tags', '--abbrev=0'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return null;
	}
}

/** `v0.131.0` → `0.131.0`, which is what the files inside it are named for. */
export function versionOf(tag) {
	return String(tag).replace(/^v/, '');
}

export { execFileSync };
