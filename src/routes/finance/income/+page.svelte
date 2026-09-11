<script lang="ts">
	import MoneyFlows from '$lib/components/MoneyFlows.svelte';
	import type { PageServerData, ActionData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();
</script>

<MoneyFlows
	{data}
	{form}
	wording={{
		newThing: 'New income',
		emptyTitle: 'No income yet',
		emptyDescription:
			'The money you expect to arrive lives here — salary, rent owed to you, anything with a rhythm. Mark one received and it records what actually arrived.',
		editTitle: 'Edit income',
		deleteTitle: 'Delete this income?',
		deleteWarning:
			' and its whole history are deleted for good. To keep the history, leave it archived instead.',
		paidChip: 'received',
		markPaid: 'Mark received',
		paidButton: 'Received',
		paidSoFar: 'Received so far'
	}}
/>
