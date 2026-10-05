<script lang="ts">
	import { storedInstance } from '$lib/instance-choice';
	import { PLAY_PARAMS, playReturnAddress, subscribeThroughPlay } from '$lib/play-billing';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Where Google Play's purchase sheet opens.
	 *
	 * On the copy of the app the phone carries, because only that origin has a
	 * bridge to the shell — see `$lib/play-billing`. The instance sends somebody
	 * here with the product and the account; this opens the sheet and sends the
	 * answer straight back. Nothing here is a screen: what is drawn is what
	 * somebody sees behind Play's sheet.
	 *
	 * `location.replace` both ways, so the purchase token is not a page anybody
	 * can go back to.
	 */
	let said = $state(t('play.opening'));

	$effect(() => {
		const carried = new URLSearchParams(location.search);
		const at = carried.get(PLAY_PARAMS.at) ?? '';
		const sku = carried.get(PLAY_PARAMS.sku) ?? '';
		const account = carried.get(PLAY_PARAMS.account) ?? '';
		const chosen = storedInstance();

		if (!at || !sku || !account || !playReturnAddress(at, chosen, sku, { cancelled: true })) {
			said = t('play.nothingToBuy');
			location.replace(chosen ?? '/');
			return;
		}

		subscribeThroughPlay(sku, account).then((answer) => {
			const back = playReturnAddress(at, chosen, sku, answer);
			if (back) location.replace(back);
		});
	});
</script>

<p class="p-6 text-sm text-gray-500">{said}</p>
