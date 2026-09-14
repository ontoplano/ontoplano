/**
 * The phone apps, one per instance.
 *
 * Three apps live side by side on a phone — the real one, the one pointed at
 * a laptop on the LAN, and staging — because reading a bug on staging while
 * your own week is in the other app is the ordinary case, and one app that
 * switches between them loses whichever you were not looking at.
 *
 * They are the same shell and the same build, and every one of them carries
 * the whole app inside it. What differs is an application id (so Android
 * keeps them apart), a name, an icon, and which address its first screen
 * suggests. None of them is pointed at a server by the native layer: each
 * boots its own copy and the person says where to go, which is what lets any
 * of them be turned into a phone-only instance and back without a different
 * build existing.
 *
 * Run from `make android-install-all`; it rewrites what it owns every time, so
 * `cap add android` regenerating the project loses nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'capacitor/android/app');

/**
 * How much of the adaptive icon's foreground the mark fills, read from the one
 * file that decides how the brand is drawn rather than repeated here — a
 * number two scripts have to agree on is a number that drifts.
 */
/**
 * The two strings the app and this script have to agree on, read out of the
 * app's own module rather than repeated here: a user agent marker the page
 * tests for, and the name of the file this writes for it to read.
 */
const { APP_USER_AGENT, INSTANCE_SUGGESTION_FILE } = (() => {
	const source = readFileSync(join(ROOT, 'src/lib/instance-choice.ts'), 'utf8');
	const read = (name) => {
		const found = source.match(new RegExp(`export const ${name} = '([^']+)';`));
		if (!found) throw new Error(`src/lib/instance-choice.ts no longer exports ${name}`);
		return found[1];
	};
	return {
		APP_USER_AGENT: read('APP_USER_AGENT'),
		INSTANCE_SUGGESTION_FILE: read('INSTANCE_SUGGESTION_FILE')
	};
})();

const ADAPTIVE_FOREGROUND_SCALE = (() => {
	const brand = readFileSync(join(ROOT, 'src/lib/logo/brand.ts'), 'utf8');
	const found = brand.match(/export const ADAPTIVE_FOREGROUND_SCALE = ([^;]+);/);
	if (!found) throw new Error('src/lib/logo/brand.ts no longer exports ADAPTIVE_FOREGROUND_SCALE');
	return Number(found[1].trim());
})();

/*
 * The app's own version, so a phone can say which build it is holding.
 *
 * `versionCode` is the same arithmetic `make android` uses for the store
 * build — 0.145.0 becomes 14500 — so the three apps and the store one are
 * always talking about the same release.
 */
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const [major, minor, patch] = version.split('.').map(Number);
const versionCode = major * 10000 + minor * 100 + patch;

/**
 * Where each app points, and what it is called.
 *
 * The addresses are the operator's, so they come from the environment with
 * the project's own as the default. A LAN address changes whenever the
 * router feels like it: pass it in rather than editing this file.
 */
/** The port `make dev` serves on. One number, named where it is read. */
const DEV_PORT = 1493;

/**
 * This machine's address on the wifi, which is the one a phone can reach.
 *
 * Asked of the routing table rather than of an interface name, because which
 * card is "the" card differs per machine — and asked at all because the DEV
 * app's whole job is to open the laptop sitting next to the phone. A guess
 * baked in a month ago is an app that opens nothing.
 */
function lanAddress() {
	try {
		const route = execFileSync('ip', ['route', 'get', '1.1.1.1'], { encoding: 'utf8' });
		const found = /\bsrc\s+(\S+)/.exec(route)?.[1];
		/*
		 * A container's own address is not the wifi's.
		 *
		 * Docker's default bridge is 172.17–172.31, and a build running inside
		 * one finds that rather than the laptop it is running on — an address
		 * no phone on the network can reach. Better to say so than to ship an
		 * app that opens nothing.
		 */
		if (found && !/^172\.(1[6-9]|2\d|3[01])\./.test(found)) return found;
	} catch {
		/* no `ip`, or no route out: fall through */
	}
	console.warn(
		'flavours: this machine cannot tell what its address on the wifi is — a build inside a\n' +
			'          container never can. The DEV app is pointed at localhost, which on a phone is\n' +
			'          the phone itself. Set it once in local.mk, or for one run:\n' +
			`            make android-install-all ONTOPLANO_DEV_ORIGIN=http://192.168.1.10:${DEV_PORT}`
	);
	return 'localhost';
}

/**
 * The addresses the app may open in itself.
 *
 * `*`, and it has to be. A self-hosted instance is at an address nobody here
 * can know, and Capacitor's matcher cannot express "anything on my network":
 * `HostMask.Simple.matches` refuses outright when the mask has more than one
 * part and the host has a different number of them, so `192.168.*` never
 * matches `192.168.1.10` and the app hands your own laptop to the system
 * browser. A single `*` is one part, skips that test, and matches everything —
 * which is the offer the instance screen actually makes.
 *
 * It is not a hole. Nothing navigates on its own: every address here is one
 * somebody typed on that screen, and a link that leaves ontoplano is caught by
 * `$lib/outside-links` and opened outside the app on purpose.
 */
const ALLOWED_INSTANCES = ['*'];

const FLAVOURS = [
	{
		key: 'official',
		id: 'app.ontoplano',
		label: 'Ontoplano',
		icons: '',
		suggests: process.env.ONTOPLANO_ORIGIN || 'https://app.ontoplano.com'
	},
	{
		key: 'dev',
		id: 'app.ontoplano.dev',
		label: 'OntoplanoDev',
		icons: '-dev',
		suggests: process.env.ONTOPLANO_DEV_ORIGIN || `http://${lanAddress()}:${DEV_PORT}`
	},
	{
		key: 'staging',
		id: 'app.ontoplano.staging',
		label: 'OntoplanoStaging',
		icons: '-staging',
		suggests:
			process.env.ONTOPLANO_STAGING_ORIGIN ||
			`https://${process.env.ONTOPLANO_STAGING_HOST || 'staging.ontoplano.com'}`
	}
];

const NETWORK_SECURITY = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/android-flavours.mjs. Do not edit. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

/*
 * And the development flavours also trust whatever you installed yourself.
 *
 * That is how \`make https-local\` puts a certificate on a phone, and it is
 * exactly what must NOT ship: a store build that trusts user-installed CAs is
 * a build anybody who can add a certificate — an MDM, a piece of malware, a
 * captive portal that talked somebody through it — can read the traffic of.
 * The dev and staging apps keep it because that is what they are for; the
 * official one does not.
 */
const NETWORK_SECURITY_DEV = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/android-flavours.mjs. Do not edit. -->
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
            <certificates src="user" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

const LAUNCHER = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
const FOREGROUND = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };

/*
 * The same source at the same size gives the same bytes, every time.
 *
 * ImageMagick stamps a PNG with the moment it wrote it and whatever else it
 * knows, so re-running this rewrote every icon with different bytes and left
 * eighty modified files in the tree after a build. `-strip` and excluding the
 * date chunks make the output a function of the input, which is what lets
 * these be committed — F-Droid builds from the committed project and cannot
 * run an image toolchain to make them.
 */
function resize(source, out, size) {
	execFileSync('magick', [
		source,
		'-resize',
		`${size}x${size}`,
		'-strip',
		'-define',
		'png:exclude-chunk=date,time,tIME',
		out
	]);
}

/**
 * The foreground layer of an adaptive icon: the mark, small, on nothing.
 *
 * Not the web's maskable icon resized, which is what this used to be. The two
 * have different safe zones — a launcher shows 72dp of a 108dp foreground and
 * guarantees only 66 — so reusing one asset for both means the stricter of
 * them is wrong, and the way it is wrong is that the launcher's mask eats the
 * mark's corners. Drawn from the plain icon, which is the mark with no ground
 * and no margin of its own, so the only margin here is the one this asks for.
 */
function foreground(source, out, size) {
	const inner = Math.round(size * ADAPTIVE_FOREGROUND_SCALE);
	execFileSync('magick', [
		source,
		'-resize',
		`${inner}x${inner}`,
		'-background',
		'none',
		'-gravity',
		'center',
		'-extent',
		`${size}x${size}`,
		'-strip',
		'-define',
		'png:exclude-chunk=date,time,tIME',
		out
	]);
}

if (!existsSync(APP)) {
	console.log('flavours: no capacitor android project yet — nothing to write');
	process.exit(0);
}

for (const flavour of FLAVOURS) {
	const src = join(APP, 'src', flavour.key);

	// Only a development build trusts a certificate you installed yourself.
	if (flavour.key !== 'official') {
		mkdirSync(join(src, 'res/xml'), { recursive: true });
		writeFileSync(join(src, 'res/xml/network_security_config.xml'), NETWORK_SECURITY_DEV);
	}

	// The name, per flavour, so the launcher tells them apart.
	mkdirSync(join(src, 'res/values'), { recursive: true });
	writeFileSync(
		join(src, 'res/values/strings.xml'),
		`<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${flavour.label}</string>
    <string name="title_activity_main">${flavour.label}</string>
    <string name="package_name">${flavour.id}</string>
    <string name="custom_url_scheme">${flavour.id}</string>
</resources>
`
	);

	// And the icon. The marked sets are already generated from the one mark
	// by `yarn icons`; a flavour just picks which of them it wears.
	const square = join(ROOT, `static/icons/icon-512${flavour.icons}.png`);
	const maskable = join(ROOT, `static/icons/icon-maskable-512${flavour.icons}.png`);
	if (existsSync(square) && existsSync(maskable)) {
		for (const [density, size] of Object.entries(LAUNCHER)) {
			const dir = join(src, `res/mipmap-${density}`);
			mkdirSync(dir, { recursive: true });
			resize(square, join(dir, 'ic_launcher.png'), size);
			resize(square, join(dir, 'ic_launcher_round.png'), size);
			foreground(square, join(dir, 'ic_launcher_foreground.png'), FOREGROUND[density]);
		}
	}

	/*
	 * What it is, and where it is allowed to go.
	 *
	 * A flavour's assets win over the shared ones, so this is the config the
	 * app reads. There is deliberately no `server.url`: the native layer used
	 * to point three of these at a server, which made the app a window onto an
	 * instance rather than an instance — the bundled copy was never served, so
	 * "this phone only" could not be chosen in them and a fourth build existed
	 * solely to offer it. Now every one of them boots its own copy and the
	 * first screen asks.
	 *
	 * `allowNavigation` is what lets that screen move the web view somewhere
	 * else without it refusing to follow.
	 *
	 * Patterns rather than a bare `*`. Capacitor does two things with each
	 * entry: it becomes a host mask deciding what the web view may follow, and
	 * it is registered as an authority on the app's own local file server. The
	 * second is why `*` is wrong — it is not a hostname, and registering it
	 * asks the server that serves this app's files to also answer for an
	 * authority that cannot exist. The masks below cover what the offer on the
	 * instance screen actually promises: the official instance, anything under
	 * the same name, and a machine on your own network.
	 *
	 * `appendUserAgent` is how a page knows it is inside this app once it is
	 * on somebody else's origin, where none of the app's own globals reach.
	 * The instance screen needs that to offer the way back.
	 */
	mkdirSync(join(src, 'assets'), { recursive: true });
	const config = {
		appId: flavour.id,
		appName: flavour.label,
		webDir: 'public',
		appendUserAgent: APP_USER_AGENT,
		server: { allowNavigation: ALLOWED_INSTANCES }
	};
	writeFileSync(join(src, 'assets/capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');

	/*
	 * And the address its first screen suggests.
	 *
	 * Read by the app at launch, not acted on: a suggestion fills the instance
	 * screen's address field and nothing else. That is the difference between
	 * these three apps and one app three times — the DEV one opens on the
	 * laptop because that is what its box says, and the same install becomes a
	 * phone-only instance the moment somebody chooses the other square.
	 *
	 * A flavour's assets are merged over the shared ones, so this file lands
	 * beside the app's own and each flavour sees only its own.
	 */
	const bundle = join(src, 'assets/public');
	mkdirSync(bundle, { recursive: true });
	writeFileSync(
		join(bundle, INSTANCE_SUGGESTION_FILE),
		JSON.stringify({ suggests: flavour.suggests }, null, 2) + '\n'
	);
}

/*
 * Reaching an instance that is not on HTTPS.
 *
 * Android refuses cleartext by default, and the refusal arrives as
 * `ERR_CLEARTEXT_NOT_PERMITTED` in the web view with nothing else said. That
 * is fatal to the offer this app makes on its first screen: "the official
 * instance, or one you run yourself on a server or a computer at home" — and a
 * computer at home is `http://192.168.1.10:1493`, which is what the DEV app
 * points at and what a self-hoster reaches for before they have a certificate.
 *
 * So cleartext is permitted, deliberately and in one place. What makes that
 * defensible rather than lazy: this app never fetches an address of its own.
 * Every address it opens is one somebody typed on the instance screen, and the
 * pages it loads are ontoplano. There is no third-party content and nothing is
 * being downgraded behind anybody's back.
 *
 * Android has no way to say "cleartext to private addresses only" — a network
 * security config takes hostnames and literal IPs, not ranges — so the choice
 * is this or an app that cannot open a machine on your own wifi.
 */
const xmlDir = join(APP, 'src/main/res/xml');
mkdirSync(xmlDir, { recursive: true });
writeFileSync(join(xmlDir, 'network_security_config.xml'), NETWORK_SECURITY);

/*
 * And the manifest attribute that points at it.
 *
 * Written here rather than typed into the committed manifest because
 * `cap add android` regenerates that file from Capacitor's template, and a
 * hand-edit to it is a fix that survives until the next time somebody
 * regenerates the project.
 */
const MANIFEST = join(APP, 'src/main/AndroidManifest.xml');
let manifest = readFileSync(MANIFEST, 'utf8');
if (!manifest.includes('android:networkSecurityConfig')) {
	manifest = manifest.replace(
		'    <application\n',
		'    <application\n        android:networkSecurityConfig="@xml/network_security_config"\n'
	);
	writeFileSync(MANIFEST, manifest);
	manifest = readFileSync(MANIFEST, 'utf8');
}

/*
 * And Android's own backup does not copy a phone-only instance to Drive.
 *
 * Capacitor's template leaves `allowBackup="true"`, which means the system
 * copies everything under the app's data directory to the person's Google
 * account — and on this app that directory holds the isolated instance's
 * whole database, an OPFS file inside the web view's storage. The screen that
 * offers that instance says "no network, ever, for anything" and "nothing is
 * copied anywhere, so a lost phone is lost data". With auto-backup on, both
 * sentences are false and nobody was asked.
 *
 * Off, therefore, on every flavour. Exporting from Settings is the backup,
 * which is what the app already tells people to do.
 */
if (manifest.includes('android:allowBackup="true"')) {
	manifest = manifest.replace('android:allowBackup="true"', 'android:allowBackup="false"');
	writeFileSync(MANIFEST, manifest);
}

/*
 * And the flavours themselves, in the generated gradle file.
 *
 * Written between markers rather than appended, so running this twice does
 * not stack four more flavours on the four already there — and so `cap add
 * android` wiping the file costs nothing but the next run.
 */
const BUILD = join(APP, 'build.gradle');
const START = '    // <<< ontoplano flavours';
const END = '    // ontoplano flavours >>>';
const block = [
	START,
	'    flavorDimensions "instance"',
	'    productFlavors {',
	...FLAVOURS.flatMap((f) => [
		`        ${f.key} {`,
		'            dimension "instance"',
		`            applicationId "${f.id}"`,
		`            resValue "string", "app_name", "${f.label}"`,
		`            versionCode ${versionCode}`,
		`            versionName "${version}"`,
		'        }'
	]),
	'    }',
	END
].join('\n');

let gradle = readFileSync(BUILD, 'utf8');

/*
 * The project says what the app's version is, without anybody editing it.
 *
 * `defaultConfig` shipped Capacitor's placeholder 1 / "1.0" while every
 * flavour carried the real one, and the version check reads the first it
 * finds. Written from package.json here, so a release is a version bump and
 * this target, and never a number typed into a Gradle file.
 */
gradle = gradle
	.replace(/(\n {8}versionCode )\d+/, `$1${versionCode}`)
	.replace(/(\n {8}versionName ")[^"]*"/, `$1${version}"`);

if (gradle.includes(START)) {
	gradle = gradle.replace(new RegExp(`${START}[\\s\\S]*?${END}`), block);
} else {
	// After `defaultConfig { … }`, which is where a flavour block belongs.
	gradle = gradle.replace(/(\n {4}buildTypes \{)/, `\n${block}\n$1`);
}
writeFileSync(BUILD, gradle);

console.log(`flavours: ${FLAVOURS.map((f) => `${f.label} (${f.id})`).join(', ')}`);
