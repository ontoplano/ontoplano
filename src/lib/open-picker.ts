/**
 * Open the browser's own picker rather than the text field behind it.
 *
 * A date or time input is a row of typeable segments with a small icon beside
 * it, and on a phone the icon is the only part anybody wants. This throws
 * where the browser refuses — it insists on a real user gesture, and some do
 * not implement it at all — in which case the field behaves as it always did.
 */
export function openPicker(event: Event & { currentTarget: HTMLInputElement }): void {
	try {
		event.currentTarget.showPicker?.();
	} catch {
		// Not allowed here; the field still works.
	}
}
