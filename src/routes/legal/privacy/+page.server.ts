import type { PageServerLoad } from './$types';
import { legalFacts } from '$lib/server/services/legal';

export const load: PageServerLoad = async () => legalFacts();
