/**
 * A tap on a time or a date opens its picker.
 *
 * On a phone, Chrome draws a time field as segments — `--:-- --` — and a tap
 * lands on one of them: the hour turns blue and nothing else happens. The
 * clock only opens from the small icon at the field's end, so the field read
 * as broken until somebody found the icon. A date field does the same.
 *
 * So the shell wires this once, for the document, and every time and date
 * field the app mounts gets it without anybody remembering. Only for touch:
 * with a mouse and a keyboard, typing into the segments is the quick way, and
 * a picker springing open over them is in the way.
 */

/** The fields the browser draws a picker for. */
export const PICKER_TYPES: readonly string[] = ['time', 'date', 'datetime-local', 'month', 'week'];

export function isPickerField(target: EventTarget | null): target is HTMLInputElement {
	return (
		target instanceof HTMLInputElement &&
		PICKER_TYPES.includes(target.type) &&
		!target.disabled &&
		!target.readOnly
	);
}

/** Whether this click came from a finger. */
function isTap(event: MouseEvent, coarse: () => boolean): boolean {
	const kind = (event as PointerEvent).pointerType;
	// A click that is not a PointerEvent (older WebKit) says nothing; the
	// device's main pointer answers instead.
	return kind ? kind === 'touch' : coarse();
}

export function tapOpensPicker(root: Document): () => void {
	const coarse = () => root.defaultView?.matchMedia('(pointer: coarse)').matches ?? false;

	const onClick = (event: MouseEvent) => {
		if (!isPickerField(event.target) || !isTap(event, coarse)) return;
		try {
			event.target.showPicker();
		} catch {
			// Not supported, or the picker is already open: the tap still focused
			// the field, which is what it did before.
		}
	};

	root.addEventListener('click', onClick);
	return () => root.removeEventListener('click', onClick);
}
