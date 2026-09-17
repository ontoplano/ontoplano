/**
 * A CSS custom property, in pixels.
 *
 * `getPropertyValue` hands back whatever was written — `3.5rem`, `14px`,
 * `env(safe-area-inset-bottom, 0px)` already resolved — and `parseFloat` of
 * `3.5rem` is **3.5**. Three and a half pixels where fifty-six were meant.
 *
 * That is not a rounding error, it is the wrong number by a factor of the root
 * font size, and what it looked like was the capture wheel sitting fifty
 * pixels too low: drawn half behind the navigation bar, with its bottom wedge
 * the hardest one to hit on the screen it was designed for.
 *
 * Units, because a stylesheet is free to change them. `rem` against the root
 * font size, `em` against the element asked about, anything else taken as
 * pixels — which covers `px` and the `0px` an unresolved `env()` falls back
 * to.
 */
export function cssLengthPx(value: string, of: Element = document.documentElement): number {
	const trimmed = value.trim();
	const number = parseFloat(trimmed);
	if (!Number.isFinite(number)) return 0;

	if (trimmed.endsWith('rem')) {
		const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
		return number * (Number.isFinite(root) ? root : 16);
	}
	if (trimmed.endsWith('em')) {
		const own = parseFloat(getComputedStyle(of).fontSize);
		return number * (Number.isFinite(own) ? own : 16);
	}
	return number;
}

/** The same, read straight off a custom property. */
export function cssVarPx(name: string, of: Element = document.documentElement): number {
	return cssLengthPx(getComputedStyle(of).getPropertyValue(name), of);
}
