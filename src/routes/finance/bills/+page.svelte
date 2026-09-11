<script lang="ts">
	import MoneyFlows from '$lib/components/MoneyFlows.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<MoneyFlows
	{data}
	{form}
	wording={{
		newThing: 'New bill',
		emptyTitle: 'No bills yet',
		emptyDescription:
			'The bills you expect to pay live here. Mark one paid and it records what you actually paid.',
		editTitle: 'Edit bill',
		deleteTitle: 'Delete this bill?',
		deleteWarning:
			' and its whole payment history are deleted for good. To keep the history, leave it archived instead.',
		paidChip: 'paid',
		markPaid: 'Mark paid',
		paidButton: 'Paid',
		paidSoFar: 'Paid so far'
	}}
/>
