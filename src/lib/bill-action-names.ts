/**
 * Where a bill row posts, on each screen that shows one.
 *
 * The same component draws the row in Finance and inside a notebook, and the
 * two routes cannot use the same action names — a notebook page already
 * answers to `delete` and `update` for the notebook itself. So the names are a
 * prop, exactly as `$lib/goal-action-names` and `$lib/idea-action-names` do.
 */
export type BillActionNames = {
	pay: string;
	unpay: string;
	archive: string;
};

/** The Finance room's Bills tab, where a bill is what the page is about. */
export const BILL_ROOM_ACTIONS: BillActionNames = {
	pay: '?/pay',
	unpay: '?/unpay',
	archive: '?/archive'
};

/** Inside a notebook, where the unprefixed names belong to the notebook. */
export const NOTEBOOK_BILL_ACTIONS: BillActionNames = {
	pay: '?/billPay',
	unpay: '?/billUnpay',
	archive: '?/billArchive'
};
