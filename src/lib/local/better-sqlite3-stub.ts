/**
 * What 'better-sqlite3' resolves to in a browser bundle.
 *
 * Drizzle's better-sqlite3 driver imports the native module at the top of the
 * file, but only ever constructs it when handed a filename instead of a
 * client — a path the local instance never takes, because the worker builds
 * its own WASM client and passes it in. This stand-in exists so the import
 * resolves; constructing it means somebody took the filename path, and that
 * is a bug worth its own sentence.
 */
export default class Database {
	constructor() {
		throw new Error(
			'better-sqlite3 does not exist in a browser. ' +
				'Open the WASM database and hand drizzle() the client from $lib/local/wasm-client.'
		);
	}
}
