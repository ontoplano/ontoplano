/**
 * A key pressed while a word is being composed belongs to the keyboard.
 *
 * Japanese, Chinese and Korean are typed through an input method: the keys
 * build a word, and Enter confirms it — so Enter is not "submit" until the
 * word is finished, and a letter is not a shortcut. Android's own keyboards
 * compose Latin words the same way. Every handler in the app could check
 * `isComposing` (one did); one listener here checks it for all of them, ahead
 * of every other, and stops the press from reaching the app. Nothing is
 * prevented, so the input method still gets it.
 *
 * `keyCode` 229 is what browsers send for a key the input method has taken,
 * including the ones that arrive before `isComposing` turns true.
 */
const IME_KEY_CODE = 229;

export function composing(event: KeyboardEvent): boolean {
	return event.isComposing || event.keyCode === IME_KEY_CODE;
}

export function holdKeysWhileComposing(): () => void {
	if (typeof window === 'undefined') return () => {};
	const hold = (event: KeyboardEvent) => {
		if (composing(event)) event.stopImmediatePropagation();
	};
	window.addEventListener('keydown', hold, true);
	return () => window.removeEventListener('keydown', hold, true);
}
