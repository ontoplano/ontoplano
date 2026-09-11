import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

/*
 * A checkout's own ignores, when it has any.
 *
 * `.ignore.local` is where anything particular to one machine belongs —
 * another repository cloned inside this directory, most often. It is not part
 * of this repository and it is absent from a fresh clone, so it is read only
 * if it exists.
 */
const excludePath = path.resolve(import.meta.dirname, '.ignore.local');
const localIgnores = existsSync(excludePath) ? [includeIgnoreFile(excludePath)] : [];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// The Capacitor shell is a generated native project; its JavaScript is
	// Capacitor's, not this app's, and the app's rules do not apply to it.
	{ ignores: ['capacitor/**'] },
	...localIgnores,
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',

			// `placeholder={'a\nb'}` is not a useless mustache: a plain attribute
			// would put a backslash and an n on the screen. The multi-line
			// placeholders on the plan's paste-a-week box and the quotes field are
			// the two that need it, and the rule offers this option for exactly
			// that case.
			'svelte/no-useless-mustaches': ['error', { ignoreStringEscape: true }]
		}
	},
	{
		// The portable core is what lets a phone be an instance: everything in
		// these directories also runs in a browser worker, where $lib/server
		// does not exist. An import from there fails the worker build with a
		// far worse message than this one.
		files: ['src/lib/services/**', 'src/lib/db/**', 'src/lib/self-contained/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['$lib/server', '$lib/server/*', '**/lib/server', '**/lib/server/*'],
							message:
								'This module also runs on a self-contained instance, where the server does not exist. Bind what you need through $lib/services/host.ts instead.'
						}
					]
				}
			]
		}
	},
	{
		// I2: route handlers are adapters, not data access. Everything that talks
		// to the database lives in `src/lib/services/` (or, for the server-only
		// modules, `src/lib/server/services/`), which is what makes
		// the same logic reachable from a form action and from the JSON API, and
		// what keeps the ownership predicate (I1) in one place per entity.
		files: ['src/routes/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: [
								'$lib/server/db',
								'$lib/server/db/*',
								'**/lib/server/db',
								'**/lib/server/db/*',
								'$lib/db',
								'$lib/db/*',
								'**/lib/db',
								'**/lib/db/*'
							],
							message:
								'Routes do not query the database. Call a service in $lib/services instead (CONTRIBUTING.md, I2).'
						}
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	}
);
