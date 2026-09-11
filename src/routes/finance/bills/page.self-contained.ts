import { flowLoad, flowActions } from '../flows';

// Money going out. Income is the same factory pointed the other way.
export const load = flowLoad('out');
export const actions = flowActions('out');
