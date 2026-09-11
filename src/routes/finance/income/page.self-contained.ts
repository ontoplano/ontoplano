import { flowLoad, flowActions } from '../flows';

// Money coming in, recorded exactly the way bills are: a name, an expected
// amount, a rhythm, one payment per period. See ../flows.ts.
export const load = flowLoad('in');
export const actions = flowActions('in');
