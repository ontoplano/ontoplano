import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-node';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// defaults to rune mode for the project, execept for `node_modules`. Can be removed in svelte 6.
		runes: ({ filename }) => {
			const relativePath = relative(import.meta.dirname, filename);
			const pathSegments = relativePath.toLowerCase().split(sep);
			const isExternalLibrary = pathSegments.includes('node_modules');

			return isExternalLibrary ? undefined : true;
		}
	},
	kit: {
		adapter: adapter()
		// csrf.checkOrigin is left at its default of `true`. It is the only CSRF
		// defence this app has — there are no tokens — so turning it off makes
		// every form action forgeable by any page on the internet. If a form
		// starts failing behind a proxy, the fix is to set ORIGIN correctly, not
		// to disable the check.
	},
	preprocess: [mdsvex({ extensions: ['.svx', '.md'] })],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
