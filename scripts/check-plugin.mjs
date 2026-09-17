/**
 * The Claude Code plugin still describes something that exists.
 *
 * `plugin/` is a second, smaller surface onto this app: a manifest, an MCP
 * server definition, a skill and three commands. Nothing in a build touches it
 * — it is JSON and markdown read by another program on somebody else's
 * machine — so it is exactly the kind of thing that rots quietly and is found
 * broken by a person trying to install it.
 *
 * What this checks is only what can be checked from here: that the manifest
 * parses, that the MCP server still points at this app's own endpoint through
 * the values the plugin asks the user for, and that every command and skill
 * carries the frontmatter Claude Code needs to show it. Whether the plugin
 * *works* is a question for `claude plugin install`, which is in the docs.
 *
 * The marketplace that lists this plugin is its own repository now, so the
 * half of this that checked the two manifests agreed is gone with it — the
 * names have to match for the `plugin@marketplace` install line to be right,
 * and nothing here can see the other side of that any more.
 *
 *   node scripts/check-plugin.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The endpoint the server definition has to keep pointing at. */
const ENDPOINT = '/api/mcp';

const problems = [];
const fail = (what) => problems.push(what);

function read(path) {
	try {
		return JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
	} catch (e) {
		fail(`${path}: ${e.message}`);
		return null;
	}
}

const manifest = read('plugin/.claude-plugin/plugin.json');
const servers = read('plugin/.mcp.json');

if (manifest) {
	for (const field of ['name', 'description', 'version'])
		if (!manifest[field]) fail(`plugin.json has no ${field}`);

	// The two things it has to ask for. Without them the server definition
	// substitutes empty strings and the failure is a 401 nobody can explain.
	for (const key of ['url', 'key'])
		if (!manifest.userConfig?.[key]) fail(`plugin.json does not ask the user for "${key}"`);

	if (manifest.userConfig?.key?.sensitive !== true)
		fail('the key must be marked sensitive, or it is written into settings.json in the clear');
}

if (servers) {
	const one = servers.mcpServers?.ontoplano;
	if (!one) fail('.mcp.json no longer defines the ontoplano server');
	else {
		if (!String(one.url ?? '').endsWith(ENDPOINT))
			fail(`.mcp.json points at ${one.url}, not this app's ${ENDPOINT}`);
		for (const key of Object.keys(manifest?.userConfig ?? {}))
			if (!JSON.stringify(one).includes(`\${user_config.${key}}`))
				fail(`.mcp.json never uses the "${key}" the plugin asks for`);
	}
}

/** A command or a skill with no frontmatter is a file Claude Code will not show. */
function checkFrontmatter(path, needs) {
	const text = readFileSync(join(ROOT, path), 'utf8');
	if (!text.startsWith('---\n')) return fail(`${path} has no frontmatter`);

	const head = text.slice(4, text.indexOf('\n---', 4));
	for (const field of needs)
		if (!new RegExp(`^${field}:\\s*\\S`, 'm').test(head)) fail(`${path} has no ${field}`);
}

for (const file of readdirSync(join(ROOT, 'plugin/commands')))
	if (file.endsWith('.md')) checkFrontmatter(`plugin/commands/${file}`, ['description']);

for (const dir of readdirSync(join(ROOT, 'plugin/skills')))
	checkFrontmatter(`plugin/skills/${dir}/SKILL.md`, ['name', 'description']);

if (problems.length) {
	console.error('plugin:');
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}

console.log('plugin: manifests agree and every command is described');
