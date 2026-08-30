import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
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
		// I2: route handlers are adapters, not data access. Everything that talks
		// to the database lives in `src/lib/server/services/`, which is what makes
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
								'**/lib/server/db/*'
							],
							message:
								'Routes do not query the database. Call a service in $lib/server/services instead (CONTRIBUTING.md, I2).'
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
