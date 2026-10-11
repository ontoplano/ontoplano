/**
 * AI & Integrations, on an instance that is a device.
 *
 * Everything on the real page is something reaching this instance over a
 * network — an assistant, a calendar, a webhook, a widget's launcher — and a
 * phone-only instance is on none. The route still comes, so the tab and the
 * fan's robot open onto a sentence saying so rather than onto a refusal; the
 * section's layout reads `reachable` from Settings and draws that sentence in
 * place of the page, so nothing here is loaded for it.
 */
export async function load() {
	return {};
}
