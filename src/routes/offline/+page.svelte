<script lang="ts">
	// Rendered from the cache when a navigation fails, so it must not depend on
	// anything loaded from the server.
</script>

<svelte:head><title>Offline · Ontoplano</title></svelte:head>

<div class="solo-screen bg-gray-100">
	<div class="solo-card sm:max-w-sm">
		<span class="eyebrow text-gray-600">No connection</span>
		<p class="mt-2 text-sm text-gray-700">
			Ontoplano needs the network for this page. Anything you already opened is still readable.
		</p>
		<button
			onclick={() => location.reload()}
			class="mt-4 bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
		>
			Try again
		</button>
	</div>
</div>
