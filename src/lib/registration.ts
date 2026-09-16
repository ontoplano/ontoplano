/**
 * How the three registration modes are described to the person choosing.
 *
 * In `$lib` rather than on the server so the settings page can import it
 * without pulling server code into the client bundle.
 */
export const REGISTRATION_MODES = [
	{
		key: 'closed',
		label: 'app.closed',
		hint: 'app.nobodyNewTheAccountsThat'
	},
	{
		key: 'invite',
		label: 'app.byInvitation',
		hint: 'app.onlySomebodyHoldingACode'
	},
	{
		key: 'open',
		label: 'app.open',
		hint: 'app.anybodyWhoFindsThisAddress'
	}
] as const;
