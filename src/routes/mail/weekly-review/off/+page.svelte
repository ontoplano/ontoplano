<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>Weekly review turned off · ontoplano</title></svelte:head>

<div class="mx-auto max-w-md p-8 text-center">
	<h1 class="text-lg font-semibold text-gray-900">Turned off</h1>
	<p class="mt-2 text-sm text-gray-500">
		No more Monday messages. Your account and everything in it is untouched, and you can turn them
		back on under Settings → Account.
	</p>
	<a href={resolve('/')} class="btn mt-6 inline-block">Go to ontoplano</a>
</div>
