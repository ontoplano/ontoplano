import { toLocalISOString } from '../week-generator.js';
import type { Ctx } from './ctx.js';

/**
 * The timestamp services write into `created_at` / `updated_at`.
 *
 * It is the server's local time, which is wrong for anyone in another timezone
 * — finding S7, and R07 in `the planning notes/91-TASK-RECIPES.md` fixes it with a
 * migration that reinterprets the existing rows. Until that lands the format
 * cannot change, because every stored row and every string comparison in the
 * app assumes it.
 *
 * What this does buy: one call site. R07 changes this function and deletes
 * `toLocalISOString`, instead of hunting through a dozen route files.
 */
export function stamp(ctx: Ctx): string {
	return toLocalISOString(ctx.now);
}
