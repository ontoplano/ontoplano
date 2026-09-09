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
const SHORTCUTS = 'android/app/src/main/res/xml/shortcuts.xml';

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
	it('is what the web view opens', () => {
		expect(read(LAUNCHER)).toContain('Instance.rebase(this, uri)');
	});

	it('has a way back to the question', () => {
		expect(read(SHORTCUTS)).toContain('shortcutId="instance"');
		expect(read(SHORTCUTS)).toContain('InstanceSetupActivity');
	});

	it('can be reached on a link, for anything that cannot use a shortcut', () => {
		expect(read(MANIFEST)).toContain('android:scheme="ontoplano" android:host="instance"');
	});
});
