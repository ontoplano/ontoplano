import { inventoryActions } from '../actions';

/*
 * The room's own handlers, on the tab the forms are posted from. What the
 * whole room loads is in `+layout.server.ts`, which both tabs share.
 */
export const actions = inventoryActions;
