/**
 * The role vocabulary, importable by a page.
 *
 * `services/admin.ts` cannot be: it reaches the database, and a Svelte
 * component importing it would pull the server into the client bundle.
 */
export const ROLES = ['member', 'admin'] as const;
export type Role = (typeof ROLES)[number];
