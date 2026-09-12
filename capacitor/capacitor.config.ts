import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell around the isolated build.
 *
 * Capacitor serves `make isolated`'s output from the app's own origin — static
 * files, the fallback page for every path, exactly the contract
 * scripts/serve-isolated.mjs mimics. Everything the app is lives in that build;
 * this project exists for what a web page cannot reach: Android's alarms for
 * reminders, the device calendar, a biometric lock. Those arrive as plugins
 * here, one by one.
 *
 * The application id is provisional. Shipping this to Play in place of the
 * TWA (app.ontoplano.twa) means keeping that id and its signing key —
 * Estevão's call, made at release time, changed in this one line.
 */
const config: CapacitorConfig = {
	appId: 'app.ontoplano.isolated',
	appName: 'ontoplano',
	webDir: '../build-isolated'
};

export default config;
