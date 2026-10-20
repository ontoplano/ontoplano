<script lang="ts">
	import { DEVICE_ORIGIN, inPhoneApp, storedInstance } from '$lib/instance-choice';
	import { OUT_PARAM, openInSystemBrowser, outsideAddress } from '$lib/outside-links';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Where an instance's link out reaches the system browser.
	 *
	 * On the copy of the app the phone carries, because only that origin has a
	 * bridge to the shell — see `$lib/outside-links`. The instance sends the
	 * address here; this opens the browser over the app and steps back to the
	 * page the link was pressed on, so closing the browser lands there.
	 *
	 * Anywhere else — a browser, an instance's own copy of this route — it does
	 * nothing but go home: an address in the query is not followed blindly.
	 */
	let said = $state(t('out.opening'));

	$effect(() => {
		const to = outsideAddress(new URLSearchParams(location.search).get(OUT_PARAM));
		const home = storedInstance() ?? '/';
		if (!to || !inPhoneApp() || location.origin !== DEVICE_ORIGIN) {
			location.replace(home);
			return;
		}
		openInSystemBrowser(to).then((opened) => {
			if (!opened) said = t('out.couldNotOpen');
			if (history.length > 1) history.back();
			else location.replace(home);
		});
	});
</script>

<p class="p-6 text-sm text-gray-500">{said}</p>
