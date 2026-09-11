/**
 * Which settings tabs a self-contained instance shows: the personal ones.
 *
 * Deployment editing, administration, billing and family are all questions
 * about a server somebody else can reach — a device's own instance has none
 * of them, and the tabs stay away rather than opening onto refusals.
 */
import type { LayoutServerData } from './$types';

export async function load(): Promise<LayoutServerData> {
	return { canEditInstance: false, canAdminister: false, billable: false, family: false };
}
