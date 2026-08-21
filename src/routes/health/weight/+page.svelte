<script lang="ts">
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<div class="border border-gray-200 bg-white p-6 shadow-card">
	<span class="eyebrow text-gray-500">Weight</span>
	<p class="mt-2 text-sm text-gray-700">
		Weight readings arrive as a data stream rather than being read out of another app's database, so
		they belong to your account and work on any machine.
	</p>
	<p class="mt-2 text-sm text-gray-500">
		Nothing has pushed to <code class="border border-gray-200 bg-gray-50 px-1">{data.slug}</code> yet.
		Create an API token, then have your scale or phone post readings to it.
	</p>
	<a
		href="/settings/integrations"
		class="mt-4 inline-block bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
	>
		Set up an integration
	</a>
</div>
