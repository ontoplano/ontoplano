/**
 * Build the Android app.
 *
 * The Android artifact is a Trusted Web Activity: Chrome rendering the deployed
 * site inside our own APK, which means the app is the PWA rather than a second
 * implementation of it. Shipping a change is a deploy, not a store review.
 *
 * Everything that identifies the build — domain, package name, version, signing
 * key — comes from the environment, because a committed twa-manifest.json with
 * someone's domain baked in is wrong for every other deployment.
 *
 *   ONTOPLANO_DOMAIN=plan.example.com \
 *   ANDROID_PACKAGE_NAME=app.ontoplano.twa \
 *   node scripts/build-twa.mjs
 *
 * Requires a JDK and the Android SDK; point Bubblewrap at them once in
 * ~/.bubblewrap/config.json.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const DIR = 'android-twa';

/**
 * The origin the app opens.
 *
 * ONTOPLANO_ORIGIN takes a full origin including scheme and port, which is what
 * a self-hosted instance on a LAN looks like: http://192.168.1.50:1493.
 * ONTOPLANO_DOMAIN remains for the ordinary https case.
 */
const rawOrigin = process.env.ONTOPLANO_ORIGIN
	? process.env.ONTOPLANO_ORIGIN
	: process.env.ONTOPLANO_DOMAIN
		? `https://${process.env.ONTOPLANO_DOMAIN}`
		: null;

if (!rawOrigin) {
	console.error(
		'Set ONTOPLANO_ORIGIN to the address the app opens, e.g.\n' +
			'  ONTOPLANO_ORIGIN=http://192.168.1.50:1493\n' +
			'  ONTOPLANO_ORIGIN=https://plan.example.com\n' +
			'A TWA is bound to one origin; there is no sensible default.'
	);
	process.exit(1);
}

let parsed;
try {
	parsed = new URL(rawOrigin);
} catch {
	console.error(`ONTOPLANO_ORIGIN is not a URL: ${rawOrigin}`);
	process.exit(1);
}

const scheme = parsed.protocol.replace(':', '');
// `host` keeps the port, which is part of the origin a TWA is bound to.
const domain = parsed.host;
const cleartext = scheme === 'http';

if (cleartext) {
	console.warn(
		`\nBuilding against ${rawOrigin}, which is plain HTTP. Two consequences:\n` +
			'  - The URL bar stays. Digital Asset Links verification requires HTTPS,\n' +
			'    so the app cannot prove it owns the origin and Chrome keeps the bar.\n' +
			'  - No offline. Service workers only run in a secure context, so the one\n' +
			'    this app ships never registers over http.\n' +
			'Put the site behind HTTPS — Tailscale Serve and Caddy both do this for a\n' +
			'LAN address — and both go away with no change to the app.\n'
	);
}

const packageId = process.env.ANDROID_PACKAGE_NAME ?? 'app.ontoplano.twa';

const keyAlias = process.env.ANDROID_KEY_ALIAS ?? 'ontoplano';
const keystoreSetting = process.env.ANDROID_KEYSTORE ?? join(DIR, 'android.keystore');
const keystorePath = isAbsolute(keystoreSetting)
	? keystoreSetting
	: resolve(process.cwd(), keystoreSetting);
const versionName = process.env.ANDROID_VERSION_NAME ?? '1.0.0';
// Play requires this to increase with every upload and never repeat.
const versionCode = Number(process.env.ANDROID_VERSION_CODE ?? 1);
const origin = `${scheme}://${domain}`;

/**
 * Where Bubblewrap reads the icons and manifest while generating the project.
 *
 * Normally the deployed site. Separated from `origin` so a build machine that
 * cannot reach the public domain — CI, or a laptop before the first deploy —
 * can point at a locally running server. It changes only where bytes are
 * fetched from; the app is still bound to ONTOPLANO_DOMAIN.
 */
const assetOrigin = process.env.ONTOPLANO_ASSET_ORIGIN ?? origin;

/**
 * Colours come from the web manifest so the two cannot drift.
 *
 * `navigationColor` is the Android navigation bar; matching the chrome keeps
 * the app from ending in a stripe of the wrong colour.
 */
const twaManifest = {
	packageId,
	host: domain,
	name: 'Ontoplano',
	launcherName: 'Ontoplano',
	display: 'standalone',
	themeColor: '#111827',
	themeColorDark: '#111827',
	navigationColor: '#111827',
	navigationColorDark: '#111827',
	navigationDividerColor: '#111827',
	navigationDividerColorDark: '#111827',
	backgroundColor: '#111827',
	enableNotifications: false,
	startUrl: '/',
	iconUrl: `${assetOrigin}/icons/icon-512.png`,
	maskableIconUrl: `${assetOrigin}/icons/icon-maskable-512.png`,
	splashScreenFadeOutDuration: 300,
	signingKey: {
		// Absolute, because Bubblewrap runs with its cwd inside DIR and a relative
		// path here was being resolved against DIR twice.
		path: keystorePath,
		alias: keyAlias
	},
	appVersionName: versionName,
	appVersionCode: versionCode,
	shellVersion: '1.0.0',
	webManifestUrl: `${assetOrigin}/manifest.webmanifest`,
	// A TWA that cannot verify its domain falls back to a Custom Tab, which at
	// least keeps the app usable rather than showing an error.
	fallbackType: 'customtabs',
	features: {},
	alphaDependencies: { enabled: false },
	enableSiteSettingsShortcut: true,
	isChromeOSOnly: false,
	isMetaQuest: false,
	fullScopeUrl: `${origin}/`,
	minSdkVersion: 23,
	orientation: 'default',
	shortcuts: [
		{
			name: 'Board',
			shortName: 'Board',
			url: `${origin}/planner/board`,
			chosenIconUrl: `${assetOrigin}/icons/shortcut-board.png`
		},
		{
			name: 'Diary',
			shortName: 'Diary',
			url: `${origin}/diary`,
			chosenIconUrl: `${assetOrigin}/icons/shortcut-diary.png`
		},
		{
			name: 'Goals',
			shortName: 'Goals',
			url: `${origin}/goals`,
			chosenIconUrl: `${assetOrigin}/icons/shortcut-goals.png`
		}
	],
	generatorApp: 'bubblewrap-cli'
};

mkdirSync(DIR, { recursive: true });
const manifestPath = join(DIR, 'twa-manifest.json');
writeFileSync(manifestPath, JSON.stringify(twaManifest, null, 2) + '\n');
console.log(`Wrote ${manifestPath} for ${origin}`);

/**
 * Make sure a signing key exists *before* building.
 *
 * Bubblewrap signs as its last step, so a missing key surfaced as a failure
 * after a full Gradle build with nothing to show for it. Creating it here costs
 * a second and turns the common first-run case into something that just works.
 */
function ensureSigningKey() {
	if (existsSync(keystorePath)) return;

	const password =
		process.env.ANDROID_KEYSTORE_PASSWORD ?? process.env.BUBBLEWRAP_KEYSTORE_PASSWORD;

	if (!password) {
		console.error(
			`\nNo signing key at ${keystorePath}, and no password to create one with.\n\n` +
				'Pick a password and keep it — an app is tied to its key permanently:\n' +
				'  BUBBLEWRAP_KEYSTORE_PASSWORD=... BUBBLEWRAP_KEY_PASSWORD=... make android\n'
		);
		process.exit(1);
	}

	console.log(`\nCreating a signing key at ${keystorePath}…`);
	mkdirSync(dirname(keystorePath), { recursive: true });

	execFileSync(
		'keytool',
		[
			'-genkeypair',
			'-keystore',
			keystorePath,
			'-alias',
			keyAlias,
			'-keyalg',
			'RSA',
			'-keysize',
			'2048',
			// Play refuses keys that expire before 2033; 10000 days is the
			// convention and comfortably past it.
			'-validity',
			'10000',
			'-storepass',
			password,
			'-keypass',
			process.env.BUBBLEWRAP_KEY_PASSWORD ?? password,
			'-dname',
			`CN=${packageId}, OU=Ontoplano, O=Ontoplano, C=XX`
		],
		{ stdio: 'inherit' }
	);

	console.log(
		'\nBack this file up somewhere safe. Losing it means republishing under a\n' +
			'new listing; leaking it lets someone else ship an update to your users.\n'
	);
}

ensureSigningKey();

/**
 * How to invoke Bubblewrap.
 *
 * Prefers a global install and falls back to npx, so this works on a machine
 * that has never installed it — which is most machines, and was the first thing
 * to fail when someone other than the author ran this.
 */
function bubblewrapCommand() {
	const globallyInstalled = (() => {
		try {
			execFileSync('bubblewrap', ['--version'], { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	})();

	if (globallyInstalled) return { file: 'bubblewrap', prefix: [] };

	try {
		execFileSync('npx', ['--version'], { stdio: 'ignore' });
	} catch {
		console.error(
			'Bubblewrap is not installed and npx is unavailable.\n' + '  npm install -g @bubblewrap/cli'
		);
		process.exit(1);
	}

	console.log('Bubblewrap not installed globally; running it through npx.');
	return { file: 'npx', prefix: ['--yes', '@bubblewrap/cli@latest'] };
}

/**
 * Bubblewrap shells out to a JDK and the Android SDK, and its own failure when
 * they are missing is a Java stack trace. Say it plainly first.
 */
function checkToolchain() {
	const configured = existsSync(join(homedir(), '.bubblewrap', 'config.json'));
	if (configured) return;

	try {
		execFileSync('java', ['-version'], { stdio: 'ignore' });
	} catch {
		console.error(
			'\nNo JDK found, and Bubblewrap has no toolchain configured.\n' +
				'Either install one and point Bubblewrap at it:\n' +
				'  ~/.bubblewrap/config.json\n' +
				'  { "jdkPath": "/usr/lib/jvm/java-21-openjdk-amd64", "androidSdkPath": "..." }\n' +
				'or let Bubblewrap fetch its own on first run — it will offer to.\n' +
				'See docs/ANDROID.md.\n'
		);
	}
}

const bubblewrap = bubblewrapCommand();
checkToolchain();

const run = (args) =>
	execFileSync(bubblewrap.file, [...bubblewrap.prefix, ...args], {
		cwd: DIR,
		stdio: 'inherit',
		env: process.env
	});

console.log('\nGenerating the Android project…');
// --skipVersionUpgrade keeps `update` non-interactive; without it Bubblewrap
// stops to ask for a version name. The cost is that it then leaves versionName
// empty in build.gradle, which Play rejects, so it is written here instead —
// from the environment, where the rest of the build's identity already lives.
run(['update', '--skipVersionUpgrade']);

const gradlePath = join(DIR, 'app', 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8')
	.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
	.replace(/versionName\s+"[^"]*"/, `versionName "${versionName}"`);

if (cleartext) {
	/*
	 * Bubblewrap hardcodes https in its Gradle template — it assumes a TWA can
	 * only target a secure origin, which is true of a published app and not of
	 * a self-hosted box on a LAN.
	 *
	 * Rewritten narrowly: the one expression that builds launchUrl, and literal
	 * URLs already carrying our own host. A blanket https→http replacement would
	 * also rewrite the Maven repository URLs in the same file.
	 */
	gradle = gradle
		.replaceAll('"https://" + twaManifest.hostName', `"${scheme}://" + twaManifest.hostName`)
		.replaceAll(`https://${domain}`, `${scheme}://${domain}`);
}

writeFileSync(gradlePath, gradle);
console.log(`Set version ${versionName} (${versionCode})`);

if (cleartext) {
	// Android has blocked cleartext by default since API 28, so without this the
	// app launches to a blank page and nothing explains why.
	const manifestXmlPath = join(DIR, 'app', 'src', 'main', 'AndroidManifest.xml');
	const xml = readFileSync(manifestXmlPath, 'utf8');

	if (!xml.includes('usesCleartextTraffic')) {
		writeFileSync(
			manifestXmlPath,
			xml.replace('<application', '<application\n        android:usesCleartextTraffic="true"')
		);
		console.log('Allowed cleartext traffic, required to reach an http origin');
	}
}

console.log('\nBuilding…');
run(['build', '--skipPwaValidation']);

console.log(
	'\nDone. Artifacts are in ' +
		DIR +
		':\n' +
		'  app-release-signed.apk   — sideload or distribute directly\n' +
		'  app-release-bundle.aab   — upload this one to Play\n\n' +
		'Then set ANDROID_CERT_FINGERPRINTS on the server to the SHA-256 fingerprint\n' +
		"of the signing key (and of Play's app-signing key once uploaded), so\n" +
		'/.well-known/assetlinks.json verifies and the URL bar disappears.'
);
