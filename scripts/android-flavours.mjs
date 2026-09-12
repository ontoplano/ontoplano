/**
 * The phone apps, one per instance.
 *
 * Three apps live side by side on a phone — the real one, the one pointed at
 * a laptop on the LAN, and staging — because reading a bug on staging while
 * your own week is in the other app is the ordinary case, and one app that
 * switches between them loses whichever you were not looking at.
 *
 * They are the same shell and the same build: what differs is an application
 * id (so Android keeps them apart), a name, an icon, and the instance each
 * one opens on. The `device` flavour is the odd one out and the reason this
 * file exists at all — it opens on the copy of the app bundled inside it,
 * with no server anywhere.
 *
 * Run from `make android-phones`; it rewrites what it owns every time, so
 * `cap add android` regenerating the project loses nothing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = join(ROOT, 'capacitor/android/app');

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
const FLAVOURS = [
	{
		key: 'official',
		id: 'app.ontoplano',
		label: 'Ontoplano',
		icons: '',
		url: process.env.ONTOPLANO_ORIGIN || 'https://app.ontoplano.com'
	},
	{
		key: 'dev',
		id: 'app.ontoplano.dev',
		label: 'Ontoplano DEV',
		icons: '-dev',
		url: process.env.ONTOPLANO_DEV_ORIGIN || 'http://192.168.1.10:1493'
	},
	{
		key: 'staging',
		id: 'app.ontoplano.staging',
		label: 'Ontoplano — Staging',
		icons: '-staging',
		url:
			process.env.ONTOPLANO_STAGING_ORIGIN ||
			`https://${process.env.ONTOPLANO_STAGING_HOST || 'staging.ontoplano.com'}`
	},
	{
		// No URL: this one is the app, not a window onto one.
		key: 'device',
		id: 'app.ontoplano.isolated',
		label: 'Ontoplano',
		icons: '',
		url: null
	}
];

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

if (!existsSync(APP)) {
	console.log('flavours: no capacitor android project yet — nothing to write');
	process.exit(0);
}

for (const flavour of FLAVOURS) {
	const src = join(APP, 'src', flavour.key);

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
			resize(maskable, join(dir, 'ic_launcher_foreground.png'), FOREGROUND[density]);
		}
	}

	/*
	 * Where it opens.
	 *
	 * A flavour's assets win over the shared ones, so this is the config the
	 * app reads. `allowNavigation` is what lets the instance screen inside the
	 * app move it somewhere else without the web view refusing to follow.
	 */
	mkdirSync(join(src, 'assets'), { recursive: true });
	const config = {
		appId: flavour.id,
		appName: flavour.label,
		webDir: 'public',
		...(flavour.url
			? {
					server: {
						url: flavour.url,
						cleartext: flavour.url.startsWith('http://'),
						allowNavigation: FLAVOURS.filter((f) => f.url).map((f) =>
							new URL(f.url).host.replace(/:\d+$/, '')
						)
					}
				}
			: {})
	};
	writeFileSync(join(src, 'assets/capacitor.config.json'), JSON.stringify(config, null, 2) + '\n');
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
