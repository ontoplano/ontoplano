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
 *   ONTOPLANO_ORIGIN=https://plan.example.com \
 *   ANDROID_PACKAGE_NAME=app.ontoplano.twa \
 *   node scripts/build-twa.mjs
 *
 * Requires a JDK and the Android SDK; point Bubblewrap at them once in
 * ~/.bubblewrap/config.json.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { androidEnv } from './lib/android-env.mjs';
import { defaultIdentity, identityFrom, packageIdFor } from './twa-identity.mjs';

const DIR = 'android-twa';

/**
 * The origin the app opens.
 *
 * ONTOPLANO_ORIGIN takes a full origin including scheme and port, which is what
 * a self-hosted instance on a LAN looks like: http://192.168.1.50:1493 — and
 * https://plan.example.com for the ordinary case. One name, everywhere.
 */
const rawOrigin = process.env.ONTOPLANO_ORIGIN || null;

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

const packageId = packageIdFor(domain, process.env.ANDROID_PACKAGE_NAME);

const keyAlias = process.env.ANDROID_KEY_ALIAS ?? 'ontoplano';
const keystoreSetting = process.env.ANDROID_KEYSTORE ?? join(DIR, 'android.keystore');
const keystorePath = isAbsolute(keystoreSetting)
	? keystoreSetting
	: resolve(process.cwd(), keystoreSetting);
const passwordPath = `${keystorePath}.pass`;
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
 * fetched from; the app is still bound to ONTOPLANO_ORIGIN.
 */
const assetOrigin = process.env.ONTOPLANO_ASSET_ORIGIN ?? origin;

/**
 * What the instance calls itself, asked of the instance.
 *
 * The name under the icon and the icon itself come from the manifest the
 * instance actually serves, rather than from a second list here. That is how a
 * staging build ends up called "Staging" with the marked icon without this file
 * knowing anything about staging: the server already answers that question for
 * the browser, and this asks the same question.
 *
 * Unreachable — CI, a laptop before the first deploy — falls back to the plain
 * names and says so, because a build that stops for want of a label is worse
 * than a build with a plain one on it.
 */
async function identity() {
	try {
		const answer = await fetch(`${assetOrigin}/manifest.webmanifest`, {
			signal: AbortSignal.timeout(8000)
		});
		if (!answer.ok) throw new Error(`answered ${answer.status}`);
		return identityFrom(await answer.json(), assetOrigin);
	} catch (e) {
		console.warn(
			`\nCould not read ${assetOrigin}/manifest.webmanifest (${e.message}).\n` +
				'Building with the default name and icons — check them if this is not\n' +
				'the production instance.\n'
		);
		return defaultIdentity(assetOrigin);
	}
}

const app = await identity();

/**
 * Colours come from the web manifest so the two cannot drift.
 *
 * `navigationColor` is the Android navigation bar; matching the chrome keeps
 * the app from ending in a stripe of the wrong colour.
 */
const twaManifest = {
	packageId,
	host: domain,
	name: app.name,
	launcherName: app.launcherName,
	display: 'standalone',
	themeColor: '#111827',
	themeColorDark: '#111827',
	navigationColor: '#111827',
	navigationColorDark: '#111827',
	navigationDividerColor: '#111827',
	navigationDividerColorDark: '#111827',
	backgroundColor: '#111827',
	/*
	 * Delegated to the app, so a reminder arrives as Ontoplano.
	 *
	 * Web push from a TWA is otherwise shown by the browser — a Chrome icon
	 * and the word "Chrome" over the app's own name, which reads as somebody
	 * else's notification. Delegation hands it to this package: same push,
	 * our icon, our name. (A PWA installed from the browser instead of this
	 * APK keeps the browser's badge; that part is Android's, not ours.)
	 */
	enableNotifications: true,
	startUrl: '/',
	iconUrl: app.iconUrl,
	maskableIconUrl: app.maskableIconUrl,
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
			url: `${origin}/tasks/board`,
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

// Everything that can refuse runs before anything is written, so a build that
// cannot finish leaves no half-made project behind.
// Order matters: the toolchain config must exist before Bubblewrap is invoked,
// because without it every invocation stops to ask about downloading a JDK.
checkToolchain();
const bubblewrap = bubblewrapCommand();

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
/**
 * The password for the signing key.
 *
 * Generated once and kept in a file beside the keystore, because asking a human
 * to invent and remember one buys nothing here: the key file *is* the secret,
 * and anyone who can read the password file can already read the key sitting
 * next to it. A passphrase would only matter if the keystore travelled
 * somewhere the password did not, which is not what happens on a machine
 * building its own app.
 *
 * An explicit ANDROID_KEYSTORE_PASSWORD still wins, for a key that came from
 * somewhere else or a CI secret.
 */
function keystorePassword() {
	const fromEnv = process.env.ANDROID_KEYSTORE_PASSWORD ?? process.env.BUBBLEWRAP_KEYSTORE_PASSWORD;
	if (fromEnv) return fromEnv;

	if (existsSync(passwordPath)) return readFileSync(passwordPath, 'utf8').trim();

	if (existsSync(keystorePath)) {
		// A key with no password on file: created elsewhere, and there is nothing
		// to guess.
		console.error(
			`\nThere is a signing key at ${keystorePath} but no password for it at\n` +
				`${passwordPath}, so this build cannot open it.\n\n` +
				'If you know the password:\n' +
				'  ANDROID_KEYSTORE_PASSWORD=... make android\n\n' +
				'If you do not:\n' +
				'  make android-keystore-reset\n'
		);
		process.exit(1);
	}

	const generated = randomBytes(24).toString('base64url');
	mkdirSync(dirname(passwordPath), { recursive: true });
	// Readable only by this user: it is a key password sitting on disk.
	writeFileSync(passwordPath, generated + '\n', { mode: 0o600 });
	console.log(`Generated a signing password and saved it to ${passwordPath}`);
	return generated;
}

/** Create the signing key if there is not one yet. */
function ensureSigningKey(password) {
	if (existsSync(keystorePath)) return;

	console.log(`Creating a signing key at ${keystorePath}…`);
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
			password,
			'-dname',
			`CN=${packageId}, OU=Ontoplano, O=Ontoplano, C=XX`
		],
		{ stdio: ['ignore', 'ignore', 'inherit'] }
	);

	console.log(
		`Back up ${keystorePath} and ${passwordPath} together. Losing them means\n` +
			'republishing under a new listing; leaking them lets someone else ship an\n' +
			'update to your users.'
	);
}

const signingPassword = keystorePassword();
ensureSigningKey(signingPassword);

// Handed to Bubblewrap so it never stops to ask. It signs as its last step, and
// an interactive prompt there is what turned a build into a guessing game.
process.env.BUBBLEWRAP_KEYSTORE_PASSWORD = signingPassword;
process.env.BUBBLEWRAP_KEY_PASSWORD = signingPassword;

/**
 * Locate Bubblewrap without running it.
 *
 * Deliberately a path lookup rather than `bubblewrap --version`: with no
 * config file, *any* invocation opens an interactive prompt offering to
 * download a JDK. A presence check that installs a toolchain is not a presence
 * check. Nothing here fetches anything — if a tool is missing, the answer is to
 * install it once, on purpose.
 */
function bubblewrapCommand() {
	// A project-local install counts: declared in package.json and installed by
	// the same `yarn install` as everything else.
	const local = resolve('node_modules', '.bin', 'bubblewrap');
	if (existsSync(local)) return local;

	try {
		return execFileSync('which', ['bubblewrap'], { stdio: ['ignore', 'pipe', 'ignore'] })
			.toString()
			.trim();
	} catch {
		console.error(
			'\nBubblewrap is not installed. Install it once:\n' +
				'  npm install -g @bubblewrap/cli\n' +
				'or add it to this project:\n' +
				'  yarn add -D @bubblewrap/cli\n'
		);
		process.exit(1);
	}
}

function checkToolchain() {
	const configPath = join(homedir(), '.bubblewrap', 'config.json');
	if (existsSync(configPath)) return;

	const hasJava = (() => {
		try {
			execFileSync('java', ['-version'], { stdio: 'ignore' });
			return true;
		} catch {
			return false;
		}
	})();

	const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;

	if (hasJava && sdk) {
		// Both are already installed, so record where they are rather than
		// letting Bubblewrap ask to fetch its own.
		const javaBin = execFileSync('readlink', [
			'-f',
			execFileSync('which', ['java']).toString().trim()
		])
			.toString()
			.trim();
		const jdkPath = process.env.JAVA_HOME ?? dirname(dirname(javaBin));

		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(configPath, JSON.stringify({ jdkPath, androidSdkPath: sdk }, null, 2) + '\n');
		console.log(`Pointed Bubblewrap at the installed toolchain (${jdkPath}, ${sdk})`);
		return;
	}

	console.error(
		'\nNo Android toolchain, and this will not download one for you.\n\nMissing:\n' +
			(hasJava ? '' : '  - a JDK, e.g. apt install openjdk-21-jdk-headless\n') +
			(sdk ? '' : '  - the Android SDK, with ANDROID_HOME pointing at it\n') +
			'\nOr write ~/.bubblewrap/config.json yourself:\n' +
			'  { "jdkPath": "/usr/lib/jvm/java-21-openjdk-amd64", "androidSdkPath": "..." }\n\n' +
			'See docs/ANDROID.md.\n'
	);
	process.exit(1);
}

function buildEnv() {
	const { env, notes } = androidEnv(process.env, bubblewrapSdkPath());
	for (const note of notes) console.log(note);
	return env;
}

/** What Bubblewrap recorded, when the environment says nothing. */
function bubblewrapSdkPath() {
	try {
		const configPath = join(homedir(), '.bubblewrap', 'config.json');
		if (!existsSync(configPath)) return undefined;
		return JSON.parse(readFileSync(configPath, 'utf8')).androidSdkPath;
	} catch {
		return undefined;
	}
}

const run = (args) =>
	execFileSync(bubblewrap, args, { cwd: DIR, stdio: 'inherit', env: buildEnv() });

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

/*
 * androidx.browser, named rather than inherited.
 *
 * The widget's setup screen opens the connect page in a custom tab, which is
 * how the page ends up in the browser rather than back inside this app. The
 * class comes with androidbrowserhelper today, transitively — and a transitive
 * dependency is one somebody else can drop. Naming it costs a line and turns a
 * future silent breakage into a version conflict, which is a thing gradle says
 * out loud.
 */
if (!gradle.includes('androidx.browser:browser')) {
	gradle = gradle.replace(
		/dependencies\s*\{/,
		(match) => `${match}\n    implementation 'androidx.browser:browser:1.8.0'`
	);
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

/**
 * Graft the home-screen widget onto the generated project.
 *
 * Bubblewrap regenerates `app/` from the manifest on every run, so anything
 * native has to be re-applied afterwards rather than edited in place. The
 * sources live in `android/widget/` and are copied in with `__PACKAGE__`
 * replaced: they sit in the app's own package so `R` resolves, and the package
 * is configurable.
 *
 * Java rather than Kotlin on purpose — the generated project has no Kotlin
 * plugin, and adding one to a file that is rewritten every build is a worse
 * trade than writing a few hundred lines of Java.
 */
function installWidget() {
	const source = 'android/widget';
	if (!existsSync(source)) {
		console.warn(`No ${source}; the app will build without the home-screen widget.`);
		return;
	}

	// __ORIGIN__ is the instance this build is bound to: the widget's Connect
	// button opens it, so out of the box the widget points where the app does.
	const substitute = (text) =>
		text.replaceAll('__PACKAGE__', packageId).replaceAll('__ORIGIN__', parsed.origin);
	const mainDir = join(DIR, 'app', 'src', 'main');
	const javaDir = join(mainDir, 'java', ...packageId.split('.'));

	mkdirSync(javaDir, { recursive: true });
	for (const file of readdirSync(join(source, 'java')).filter((f) => f.endsWith('.java'))) {
		writeFileSync(
			join(javaDir, file),
			substitute(readFileSync(join(source, 'java', file), 'utf8'))
		);
	}

	const resDir = join(source, 'res');
	for (const kind of readdirSync(resDir)) {
		const target = join(mainDir, 'res', kind);
		mkdirSync(target, { recursive: true });
		for (const file of readdirSync(join(resDir, kind)).filter((f) => f.endsWith('.xml'))) {
			writeFileSync(join(target, file), substitute(readFileSync(join(resDir, kind, file), 'utf8')));
		}
	}

	const manifestXmlPath = join(mainDir, 'AndroidManifest.xml');
	let xml = readFileSync(manifestXmlPath, 'utf8');

	// The widget reads the instance over the network from the app's own
	// process. The browser helper library declares this too, but a component
	// that needs a permission should say so where it lives.
	if (!xml.includes('android.permission.INTERNET')) {
		xml = xml.replace(
			'    <application',
			'    <uses-permission android:name="android.permission.INTERNET" />\n\n    <application'
		);
	}

	// Exported, all three: the launcher sends the update broadcast, binds the
	// list service, and starts the configuration screen — all from outside this
	// app. The service is additionally locked to BIND_REMOTEVIEWS, so only the
	// launcher can bind it.
	const components = `
        <receiver
            android:name=".TodayWidgetProvider"
            android:label="@string/widget_label"
            android:exported="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="app.ontoplano.widget.REFRESH" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/today_widget_info" />
        </receiver>

        <service
            android:name=".TodayWidgetService"
            android:permission="android.permission.BIND_REMOTEVIEWS"
            android:exported="false" />

        <activity
            android:name=".WidgetConfigureActivity"
            android:label="@string/configure_title"
            android:theme="@style/WidgetConfigureTheme"
            android:launchMode="singleTask"
            android:exported="true">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_CONFIGURE" />
            </intent-filter>
            <!-- The way back from the browser: the connect page hands the
                 widget its key on this link. When the launcher started this
                 screen for a result, singleTask is ignored and the link opens
                 a second instance — that one just saves the key, and the
                 waiting instance notices in onResume and answers the
                 launcher. -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="ontoplano" android:host="widget" />
            </intent-filter>
        </activity>
`;

	// Bubblewrap rewrites the manifest on every run, so this is normally a fresh
	// file — but a build that reuses one must not declare the widget twice.
	if (!xml.includes('TodayWidgetProvider')) {
		xml = xml.replace('    </application>', `${components}\n    </application>`);
	}

	writeFileSync(manifestXmlPath, xml);

	console.log('Added the home-screen widget');
}

installWidget();

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
