/**
 * The dependencies, against what is publicly known about them.
 *
 * Everything this app runs on is somebody else's code, and the advisories are
 * published — so an attacker reading this repository can look up its
 * dependencies faster than anybody here would notice. This is the part that
 * notices.
 *
 * Runtime dependencies only. A vulnerability in a build tool or a test runner
 * is worth fixing and is not the same kind of thing: it is not reachable by
 * anybody who is not already running the build, and letting it fail this would
 * teach everybody to ignore the failure.
 *
 * The floor is `high`. Not zero — `yarn audit` counts advisories against
 * *ranges*, so a moderate in something four levels down arrives on a morning
 * when nobody can do anything about it, and a check that cannot be made green
 * is a check that gets skipped. Moderates are printed, and printed is the
 * point: they are read on the way past rather than blocking a branch that has
 * nothing to do with them.
 *
 *   node scripts/audit-deps.mjs
 *   node scripts/audit-deps.mjs --level moderate   # a stricter floor, by hand
 */
import { spawnSync } from 'node:child_process';

/** What fails this. Anything below is reported and lets the branch through. */
const FLOOR = 'high';

/** Worst first, which is also how they are compared. */
const SEVERITIES = ['critical', 'high', 'moderate', 'low', 'info'];

const asked = process.argv.indexOf('--level');
const floor = asked === -1 ? FLOOR : process.argv[asked + 1];
if (!SEVERITIES.includes(floor)) {
	console.error(`--level takes one of: ${SEVERITIES.join(', ')}`);
	process.exit(2);
}

/*
 * `--groups dependencies` is what makes this about the deployed app. Yarn's
 * own exit code is a bitmask of severities found and says nothing about which
 * group they were in, so the JSON is read rather than the status.
 */
const run = spawnSync('yarn', ['audit', '--json', '--groups', 'dependencies'], {
	encoding: 'utf8',
	maxBuffer: 64 * 1024 * 1024
});

if (run.error) {
	console.error(`could not run yarn audit: ${run.error.message}`);
	process.exit(2);
}

const found = [];
for (const line of run.stdout.split('\n')) {
	if (!line.trim()) continue;
	let parsed;
	try {
		parsed = JSON.parse(line);
	} catch {
		continue;
	}
	if (parsed.type !== 'auditAdvisory') continue;
	const { advisory, resolution } = parsed.data;
	found.push({
		severity: advisory.severity,
		module: advisory.module_name,
		title: advisory.title,
		patched: advisory.patched_versions,
		path: resolution.path
	});
}

if (found.length === 0) {
	console.log('audit: nothing known against what this app runs on');
	process.exit(0);
}

const bad = SEVERITIES.indexOf(floor);
const blocking = found.filter((one) => SEVERITIES.indexOf(one.severity) <= bad);

for (const one of found.sort(
	(a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity)
)) {
	console.log(`${one.severity.padEnd(9)} ${one.module} — ${one.title}`);
	console.log(`          ${one.path}`);
	console.log(`          fixed in ${one.patched}`);
}

if (blocking.length === 0) {
	console.log(`\naudit: ${found.length} below ${floor}, none of them blocking`);
	process.exit(0);
}

console.error(
	`\naudit: ${blocking.length} at ${floor} or worse.\n` +
		'Raise the range in package.json and `yarn upgrade <name>`. When the\n' +
		'advisory is against something further down, the range it came in through\n' +
		'is usually satisfied by the fixed version already — dedupe it in\n' +
		'yarn.lock rather than pinning around it.\n'
);
process.exit(1);
