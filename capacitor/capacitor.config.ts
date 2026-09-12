import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell around the app.
 *
 * Capacitor serves `make isolated`'s output from the app's own origin — static
 * files, the fallback page for every path, exactly the contract
 * scripts/serve-isolated.mjs mimics. Every build carries that copy and boots on
 * it, and where it goes from there is the person's answer on the instance
 * screen rather than something the native layer decided. This project exists
 * for what a web page cannot reach: Android's alarms for reminders, the device
 * calendar, a biometric lock. Those arrive as plugins here, one by one.
 *
 * What each flavour overrides — its id, its name, the address its first screen
 * suggests — is written by `scripts/android-flavours.mjs`.
 */
const config: CapacitorConfig = {
	appId: 'app.ontoplano',
	appName: 'ontoplano',
	webDir: '../build-isolated'
};

export default config;
