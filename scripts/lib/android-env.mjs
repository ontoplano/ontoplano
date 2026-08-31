/**
 * One SDK path, whatever the machine says.
 *
 * Gradle refuses outright when two environment variables name different SDKs —
 * "Several environment variables and/or system properties contain different
 * paths to the SDK" — and this build is unusually good at arranging that.
 * Bubblewrap keeps its own SDK under `~/.bubblewrap` and, when its config
 * records that path, sets `ANDROID_HOME` to it for the Gradle it spawns. So a
 * machine that looks consistent from the shell —
 *
 *     ANDROID_HOME=/opt/android-sdk
 *     ANDROID_SDK_ROOT=/opt/android-sdk
 *
 * — reaches Gradle as `/home/you/.bubblewrap/android_sdk` against
 * `/opt/android-sdk` and dies, naming two paths neither of which you set that
 * way. Comparing the two here could not have caught it: they agreed at the
 * moment we looked.
 *
 * So `ANDROID_SDK_ROOT` is dropped from the build's environment always, not
 * only when it disagrees. It is the deprecated one, `ANDROID_HOME` is what
 * Google supports and what Bubblewrap writes, and one name that is definitely
 * right beats two that are probably consistent. Dropped from the child's
 * environment rather than the shell's, so nothing outside this build changes.
 *
 * @param {Record<string, string | undefined>} source the environment to build from
 * @param {string | undefined} recorded `androidSdkPath` from ~/.bubblewrap/config.json
 * @returns {{ env: Record<string, string>, notes: string[] }}
 */
export function androidEnv(source, recorded) {
	const env = /** @type {Record<string, string>} */ ({ ...source });
	const notes = [];

	const home = env.ANDROID_HOME || env.ANDROID_SDK_ROOT || recorded;
	if (home) env.ANDROID_HOME = home;

	if (env.ANDROID_SDK_ROOT) {
		if (env.ANDROID_SDK_ROOT !== env.ANDROID_HOME) {
			notes.push(
				`Ignoring ANDROID_SDK_ROOT (${env.ANDROID_SDK_ROOT}) — Gradle refuses two SDK paths.\n` +
					`Building against ANDROID_HOME (${env.ANDROID_HOME}).`
			);
		}
		delete env.ANDROID_SDK_ROOT;
	}

	/*
	 * The disagreement that actually bit, said out loud.
	 *
	 * Bubblewrap will use what it recorded and ignore the environment, so this
	 * is the difference that decides which SDK the build uses — and it is
	 * invisible from the shell, where both variables agree.
	 */
	if (recorded && env.ANDROID_HOME && recorded !== env.ANDROID_HOME) {
		notes.push(
			`Bubblewrap has ${recorded} recorded in ~/.bubblewrap/config.json and will build\n` +
				`against that, not ANDROID_HOME (${env.ANDROID_HOME}). Edit that file to change it.`
		);
	}

	return { env, notes };
}
