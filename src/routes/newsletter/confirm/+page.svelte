<script lang="ts">
	import { resolve } from '$app/paths';
	let { data } = $props();
</script>

<svelte:head><title>Subscribed · ontoplano</title></svelte:head>

<div class="mx-auto max-w-md p-8 text-center">
	<h1 class="text-lg font-semibold text-gray-900">You're on the list</h1>
	<p class="mt-2 text-sm text-gray-500">
		{data.email} will hear when ontoplano changes. Every message has a link to stop them.
	</p>
	<a href={resolve('/')} class="btn mt-6 inline-block">Have a look at it</a>
</div>
