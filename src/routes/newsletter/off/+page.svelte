<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();
</script>

<svelte:head><title>Unsubscribed · ontoplano</title></svelte:head>

<div class="mx-auto max-w-md p-8 text-center">
	<h1 class="text-lg font-semibold text-gray-900">Done</h1>
	<p class="mt-2 text-sm text-gray-500">
		Nothing more will be sent to {data.email}.
	</p>
	<a href={resolve('/')} class="btn mt-6 inline-block">Go to ontoplano</a>
</div>
