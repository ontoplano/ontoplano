<script lang="ts">
	import { onMount } from 'svelte';

	let vfs = $state('…');
	let rows = $state(-1);
	let persisted = $state('…');
	let error = $state('');

	onMount(async () => {
		persisted = String(await navigator.storage?.persist?.());

		const worker = new Worker(new URL('$lib/local/sqlite-worker.ts', import.meta.url), {
			type: 'module'
		});
		worker.onmessage = (e) => {
			if (e.data.ok) {
				rows = e.data.rows;
				vfs = e.data.vfs;
			} else {
				error = e.data.error;
				rows = -2;
			}
		};
		worker.postMessage('beat');
	});
</script>

<p data-testid="vfs">{vfs}</p>
<p data-testid="rows">{rows}</p>
<p data-testid="persisted">{persisted}</p>
<p data-testid="error">{error}</p>
