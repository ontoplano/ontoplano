/**
 * How the three registration modes are described to the person choosing.
 *
 * In `$lib` rather than on the server so the settings page can import it
 * without pulling server code into the client bundle.
 */
export const REGISTRATION_MODES = [
	{
		key: 'closed',
		label: 'Closed',
		hint: 'Nobody new. The accounts that exist keep working.'
	},
	{
		key: 'invite',
		label: 'By invitation',
		hint: 'Only somebody holding a code you made below.'
	},
	{
		key: 'open',
		label: 'Open',
		hint: 'Anybody who finds this address can create an account.'
	}
] as const;
