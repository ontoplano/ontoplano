import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The committed Android project still asks which instance it is for.
 *
 * A Trusted Web Activity is generated against one origin, and Bubblewrap puts
 * the launcher icon on the activity that opens it — so out of the box the app
 * is a client for one server and there is no asking it afterwards. That is the
 * wrong shape for software whose point is that you can run your own copy, so
 * `scripts/build-twa.mjs` moves the icon onto a chooser and redirects the web
 * view at whatever was chosen.
 *
 * All of that is manifest surgery on a file Bubblewrap rewrites from a
 * template on every run. A template change breaks it silently: the build still
 * succeeds, the app still works, and it quietly goes back to being pointed at
 * one server forever. These assertions are on the generated output that is
 * actually committed, which is the thing F-Droid builds.
 */
const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const LAUNCHER = 'android/app/src/main/java/app/ontoplano/twa/LauncherActivity.java';
const GRADLE = 'android/app/build.gradle';
const CHOOSER = 'android/app/src/main/java/app/ontoplano/twa/InstanceSetupActivity.java';
const LAYOUT = 'android/app/src/main/res/layout/instance_setup.xml';

const read = (path: string) => readFileSync(path, 'utf8');

describe('the launcher icon', () => {
	it('belongs to exactly one activity', () => {
		// Two would be two icons, and one of them would skip the question.
		const claims = read(MANIFEST).match(/android\.intent\.category\.LAUNCHER/g) ?? [];
		expect(claims).toHaveLength(1);
	});

	it('is the chooser, not the web view', () => {
		const xml = read(MANIFEST);
		const chooser = xml.indexOf('android:name=".InstanceActivity"');
		expect(chooser).toBeGreaterThan(-1);

		// The one LAUNCHER category has to sit inside that activity's block,
		// which ends at the next closing tag after it.
		const ends = xml.indexOf('</activity>', chooser);
		const block = xml.slice(chooser, ends);
		expect(block).toContain('android.intent.category.LAUNCHER');
	});

	it('leaves the web view its verified links', () => {
		// Taking MAIN/LAUNCHER off LauncherActivity must not take the https
		// filter with it, or a link to a day stops opening the app.
		expect(read(MANIFEST)).toContain('android:autoVerify="true"');
	});
});

describe('the chosen instance', () => {
	it('is what the web view opens, and the instance is told it is the app', () => {
		// One call doing both: the URL is aimed at the chosen instance, and it
		// carries the mark the server turns into `locals.nativeApp`. A launch
		// that skipped the mark would leave the account page with no way back
		// to this screen, silently.
		expect(read(LAUNCHER)).toContain('Instance.launchUrl(this, uri)');
		expect(read('android/app/src/main/java/app/ontoplano/twa/Instance.java')).toContain(
			'appendQueryParameter("app", "android")'
		);
	});

	it('has a way back to the question, in a file a build cannot overwrite', () => {
		/*
		 * The generator, not `res/xml/shortcuts.xml`.
		 *
		 * That file is not a source: Bubblewrap's Gradle template rewrites it
		 * from the web manifest's shortcuts on every `preBuild`, so the entry
		 * this test used to assert on was true in the repository and gone from
		 * every APK ever built. Asserting on the file that writes it is the
		 * only version of this check that means anything.
		 */
		const gradle = read(GRADLE);
		expect(gradle).toContain("'android:shortcutId': 'instance'");
		expect(gradle).toContain("'.InstanceSetupActivity'");
	});

	it('hangs the shortcut list on the activity holding the launcher icon', () => {
		// Android reads it from there and nowhere else. It arrived on
		// LauncherActivity, which stopped being the launcher the day the app
		// started asking which instance to open — and took every shortcut with
		// it, silently.
		const xml = read(MANIFEST);
		expect(xml.match(/android\.app\.shortcuts/g) ?? []).toHaveLength(1);

		const chooser = xml.indexOf('android:name=".InstanceActivity"');
		const block = xml.slice(chooser, xml.indexOf('</activity>', chooser));
		expect(block).toContain('android.app.shortcuts');
	});

	it('can be reached on a link, for anything that cannot use a shortcut', () => {
		expect(read(MANIFEST)).toContain('android:scheme="ontoplano" android:host="instance"');
	});
});

/**
 * And the question itself still offers all three answers.
 *
 * The chooser's sources are copied into the generated project with the build's
 * own origins substituted in, so a committed project regenerated against the
 * wrong instance — or not regenerated at all — is a screen offering somebody
 * else's server as the easy answer.
 */
describe('the chooser', () => {
	it('offers the instance this build is for, a look round, and your own', () => {
		const layout = read(LAYOUT);
		expect(layout).toContain('instance_use_default');
		expect(layout).toContain('instance_use_demo');
		expect(layout).toContain('instance_address');
	});

	it('has the production origins substituted in', () => {
		const java = read(CHOOSER);
		expect(java).toContain('BUILT_FOR = "https://app.ontoplano.com"');
		// Empty here would mean a build that quietly dropped the demo button.
		expect(java).toContain('DEMO = "https://demo.ontoplano.com"');
		expect(java).not.toContain('__ORIGIN__');
	});
});
