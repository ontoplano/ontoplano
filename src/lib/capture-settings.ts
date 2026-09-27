import { CAPTURE_KINDS } from '$lib/capture';

/**
 * How somebody has set up the capture wheel: which wedges it holds, in what
 * order, and the notebook everything written from it starts in.
 *
 * Shared by the shell, which draws the wheel from it, and by the service,
 * which stores it. Stored thin — the order, and the ones switched off — so a
 * kind the app gains later turns up on the wheel rather than being off because
 * an older answer never named it.
 */
export type CaptureSettings = {
	/** Where every capture form starts, or null for each form's own default. */
	notebookId: number | null;
	/** Every kind, in the order the wheel draws them. */
	order: string[];
	/** The kinds left off the wheel. Never all of them. */
	off: string[];
};

export const CAPTURE_SETTINGS_KEY = 'capture.settings';

export const DEFAULT_CAPTURE_SETTINGS: CaptureSettings = {
	notebookId: null,
	order: [...CAPTURE_KINDS],
	off: []
};

export function isCaptureKind(value: unknown): value is string {
	return typeof value === 'string' && CAPTURE_KINDS.includes(value);
}

/** The known kinds out of a list, once each, in the order given. */
export function knownKinds(list: readonly unknown[]): string[] {
	return [...new Set(list.filter(isCaptureKind))];
}

/** A list's known kinds in its order, then any kind it does not name, in the app's. */
export function orderKinds(list: readonly unknown[]): string[] {
	const named = knownKinds(list);
	return [...named, ...CAPTURE_KINDS.filter((kind) => !named.includes(kind))];
}

function notebookOf(value: unknown): number | null {
	const id = Number(value);
	return value !== null && value !== '' && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * The stored answer, read leniently.
 *
 * Anything unreadable is the default, an unknown kind is dropped, and a set
 * with every wedge off — which the form refuses, but a row can still say — is
 * read as none off: a wheel with nothing on it is a button that does nothing.
 */
export function parseCaptureSettings(stored: string | null | undefined): CaptureSettings {
	if (!stored) return DEFAULT_CAPTURE_SETTINGS;
	let raw: unknown;
	try {
		raw = JSON.parse(stored);
	} catch {
		return DEFAULT_CAPTURE_SETTINGS;
	}
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return DEFAULT_CAPTURE_SETTINGS;
	const { notebookId, order, off } = raw as Record<string, unknown>;
	const offKnown = knownKinds(Array.isArray(off) ? off : []);
	return {
		notebookId: notebookOf(notebookId),
		order: orderKinds(Array.isArray(order) ? order : []),
		off: offKnown.length >= CAPTURE_KINDS.length ? [] : offKnown
	};
}

export function serialiseCaptureSettings(settings: CaptureSettings): string {
	return JSON.stringify({
		notebookId: settings.notebookId,
		order: orderKinds(settings.order),
		off: knownKinds(settings.off)
	});
}

/**
 * What a form posted, before anything about notebooks is checked.
 *
 * `order` is every kind in the order the list showed; `on` the ticked ones.
 * Returns null for the one answer that cannot be kept — nothing ticked.
 */
export function readCaptureForm(raw: {
	notebookId: unknown;
	order: readonly unknown[];
	on: readonly unknown[];
}): CaptureSettings | null {
	const on = knownKinds(raw.on);
	if (on.length === 0) return null;
	const order = orderKinds(raw.order);
	return {
		notebookId: notebookOf(raw.notebookId),
		order,
		off: order.filter((kind) => !on.includes(kind))
	};
}

/**
 * The kinds the wheel draws, in its order.
 *
 * `available` is what the account can have at all — a hidden section takes
 * its wedge with it. Should that leave nothing, the wheel falls back to every
 * available kind rather than opening empty.
 */
export function wheelKinds(settings: CaptureSettings, available: readonly string[]): string[] {
	const ordered = orderKinds(settings.order).filter((kind) => available.includes(kind));
	const on = ordered.filter((kind) => !settings.off.includes(kind));
	return on.length > 0 ? on : ordered;
}

/**
 * The notebook a capture form starts in.
 *
 * The notebook on screen wins over the one in the settings: somebody who
 * opens the wheel while reading about the kitchen is writing about the
 * kitchen. Otherwise it is the chosen one, or none.
 */
export function startingNotebook(
	settings: CaptureSettings,
	route: {
		id: string | null;
		params: Record<string, string | undefined>;
		search?: URLSearchParams;
	}
): number | null {
	const here =
		route.id === NOTEBOOK_ROUTE
			? notebookOf(route.params.id)
			: route.id === NOTEBOOKS_ROUTE
				? notebookOf(route.search?.get(NOTEBOOK_PARAM) ?? null)
				: null;
	return here ?? settings.notebookId;
}

/** The screen that is one notebook, */
const NOTEBOOK_ROUTE = '/notebooks/[id]';
/** and the shelf, which opens one in place and names it in the address. */
const NOTEBOOKS_ROUTE = '/notebooks';
const NOTEBOOK_PARAM = 'notebook';
