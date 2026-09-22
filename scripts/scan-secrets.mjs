/**
 * Every line this repository has ever held, read for things that should not be in it.
 *
 * `check-no-secrets.mjs` reads the *names* of tracked files and nothing else,
 * which catches a key committed as `release.keystore` and is blind to one
 * pasted into a test fixture. This is the other half: gitleaks over the
 * content, looking for things shaped like credentials.
 *
 * Over the commits rather than over the directory, and that is the whole
 * design. A secret removed in the next commit is still in every clone that
 * already exists, so the history is the thing that matters — and scanning the
 * *directory* would read whatever else happens to be sitting in the checkout:
 * an untracked `.env` holding live keys, a sibling repository, a build. The
 * commits of this repository are exactly what a stranger who clones it gets,
 * which is the question being asked.
 *
 * The same command in CI and on a laptop: it fetches its own pinned gitleaks,
 * verifies it against the checksums upstream publishes beside it, and caches it
 * under `node_modules/.cache`. A check that needs a different incantation in CI
 * is one nobody can reproduce when it fails.
 *
 *   node scripts/scan-secrets.mjs             # every commit
 *   node scripts/scan-secrets.mjs --staged    # only what is about to be committed
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The gitleaks this repository checks against.
 *
 * Pinned so a scan is the same scan on every machine and does not become a
 * download of whatever upstream published this morning. A pin wants a watch:
 * `ontoplano-server/bin/pinned-versions.sh` has a row for this, and says so
 * when upstream moves ahead of it.
 */
export const GITLEAKS_VERSION = '8.30.1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, 'node_modules', '.cache', 'gitleaks', GITLEAKS_VERSION);
const BINARY = join(CACHE, 'gitleaks');
const RELEASES = `https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}`;

/** What the release calls the machine this is running on. */
function platform() {
	const arch = { x64: 'x64', arm64: 'arm64' }[process.arch];
	if (process.platform !== 'linux' || !arch) {
		console.error(
			`No pinned gitleaks for ${process.platform}/${process.arch}.\n` +
				'Install it yourself (brew install gitleaks, or the release page) and put it on PATH.'
		);
		process.exit(1);
	}
	return `linux_${arch}`;
}

async function download(url) {
	const answer = await fetch(url);
	if (!answer.ok) throw new Error(`${url} answered ${answer.status}`);
	return Buffer.from(await answer.arrayBuffer());
}

/**
 * The pinned binary, fetched once and checked against upstream's own checksums.
 *
 * Verified rather than trusted: this downloads a binary and then runs it over
 * the whole repository, so "it came from the right URL" is not enough on its
 * own — a wrong file should fail here rather than execute.
 */
async function gitleaks() {
	if (existsSync(BINARY)) return BINARY;

	const onPath = (() => {
		try {
			return execFileSync('command', ['-v', 'gitleaks'], { encoding: 'utf8', shell: true }).trim();
		} catch {
			return '';
		}
	})();
	if (onPath) {
		console.log(`gitleaks: using the one on PATH (${onPath})`);
		return onPath;
	}

	const archive = `gitleaks_${GITLEAKS_VERSION}_${platform()}.tar.gz`;
	console.log(`gitleaks: fetching ${archive}`);
	const [bytes, sums] = await Promise.all([
		download(`${RELEASES}/${archive}`),
		download(`${RELEASES}/gitleaks_${GITLEAKS_VERSION}_checksums.txt`).then((b) => b.toString())
	]);

	const want = sums
		.split('\n')
		.map((line) => line.trim().split(/\s+/))
		.find(([, name]) => name === archive)?.[0];
	const got = createHash('sha256').update(bytes).digest('hex');
	if (!want) throw new Error(`upstream's checksums do not mention ${archive}`);
	if (want !== got)
		throw new Error(`${archive} is not what upstream signed:\n  want ${want}\n  got  ${got}`);

	mkdirSync(CACHE, { recursive: true });
	const tarball = join(CACHE, archive);
	writeFileSync(tarball, bytes);
	execFileSync('tar', ['-xzf', tarball, '-C', CACHE, 'gitleaks']);
	rmSync(tarball);
	chmodSync(BINARY, 0o755);
	return BINARY;
}

/** A gitleaks run, as pass or fail — it exits 1 on a finding and 2 on an error. */
function scan(binary, args, what) {
	process.stdout.write(`secrets: reading ${what}\n`);
	try {
		execFileSync(binary, [...args, '--redact', '--no-banner'], {
			cwd: ROOT,
			stdio: 'inherit'
		});
		return true;
	} catch (error) {
		if (error.status === 1) return false;
		throw error;
	}
}

const staged = process.argv.includes('--staged');
const binary = await gitleaks();

/*
 * `--redact`: a scan that prints what it found writes the secret into a CI log
 * that outlives the commit it came from.
 */
const clean = staged
	? scan(binary, ['git', '.', '--staged'], 'what is staged')
	: scan(binary, ['git', '.'], 'every commit');

if (!clean) {
	console.error(
		'\nTreat anything found above as public and rotate it. Removing the line is\n' +
			'not enough — the commit is in every clone that has already been made.\n'
	);
	process.exit(1);
}

console.log(`secrets: nothing in ${staged ? 'what is staged' : 'the history'}`);
