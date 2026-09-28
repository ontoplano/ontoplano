<script lang="ts">
	import { launchAddress, storedInstance } from '$lib/instance-choice';
	import { shell } from '$lib/phone-notifications';
	import {
		HANDOFF_AT,
		HANDOFF_KEY,
		HANDOFF_SLOT,
		HANDOFF_WIDGET,
		WIDGET_SETUP_PATH
	} from '$lib/notebook-widget';
	import { useT } from '$lib/i18n';

	const t = useT();

	/**
	 * Where a home-screen widget is handed its key.
	 *
	 * The same trip as `/ring`: the instance minted the key, because that is
	 * where the session is, and only this copy of the app — the one the phone
	 * carries — has a bridge to the shell that draws the widget. So the key
	 * rides here in the address, is stored natively, and the app goes straight
	 * back to the widget list on the instance. Without a key it only asks the
	 * widgets to read again, which is what an edit needs.
	 */
	let said = $state(t('widgets.handingOver'));

	$effect(() => {
		const carried = new URLSearchParams(location.search);
		const instance = carried.get(HANDOFF_AT) ?? storedInstance();
		const key = carried.get(HANDOFF_KEY);
		const slot = Number(carried.get(HANDOFF_SLOT));
		const widget = Number(carried.get(HANDOFF_WIDGET));

		const back = () =>
			location.replace(instance ? launchAddress(new URL(WIDGET_SETUP_PATH, instance).href) : '/');

		const settings = shell();
		if (!settings || !instance) {
			said = t('widgets.phoneCouldNotTakeIt');
			back();
			return;
		}

		const done =
			key && Number.isInteger(slot) && Number.isInteger(widget)
				? settings.bindNotebookWidget({ slot, origin: instance, token: key, widget })
				: settings.refreshNotebookWidgets();

		done
			.then(() => (said = t('widgets.doneOpening')))
			.catch(() => (said = t('widgets.phoneCouldNotTakeIt')))
			.finally(back);
	});
</script>

<p class="p-6 text-sm text-gray-500">{said}</p>
