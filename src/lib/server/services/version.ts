/**
 * What is running here, and since when.
 *
 * The version, the commit and the build time are baked into the bundle by
 * `define` in vite.config.ts — a build that carries its own identity cannot
 * disagree with itself, which a file beside the bundle could. The start time is
 * this process's own, so "built at 14:02, started at 14:03" says the deploy
 * landed and "built at 14:02, started three days ago" says it did not.
 *
 * In `yarn dev` the defines are still applied, so this works there too; the
 * commit simply moves as you commit.
 */
export interface Build {
	version: string;
	commit: string;
	builtAt: string;
	startedAt: string;
}

/**
 * When this process started, as an instant.
 *
 * Computed once from uptime rather than stored at import: a module can be
 * imported lazily, and "when was this module first needed" is not the question.
 */
const STARTED_AT = new Date(Date.now() - process.uptime() * 1000).toISOString();

export function build(): Build {
	return {
		version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0',
		commit: typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'unknown',
		builtAt: typeof __APP_BUILT_AT__ === 'string' ? __APP_BUILT_AT__ : '',
		startedAt: STARTED_AT
	};
}
