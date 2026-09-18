/**
 * The actions behind the import screen, for both instances that have one.
 *
 * The screen is one `+page.svelte` and the work is one service; these are the
 * bodies in between, which were written against a server and then needed again
 * on a device. Shared rather than copied, for the reason `import-vault-action`
 * was: two pages posting to the same-named action with different code behind
 * them drift, and the first anybody hears of it is a message that says
 * something different on a phone.
 *
 * What genuinely differs stays outside: a server keeps its copy of the account
 * beside the database before a restore, and a device hands it to the person as
 * a download instead. Hence `rescue`.
 */
import { fail } from '@sveltejs/kit';

import { buildCtx } from '$lib/services/ctx';
import { importTasks } from '$lib/services/imports';
import { importAccount, previewImport } from '$lib/services/account-import';
import { toActionFailure } from '$lib/http-errors';
import { translatorFor } from './i18n/core.js';
import { SOURCE_LOCALE } from './i18n/locales.js';
import { getLocale } from './services/settings.js';

/**
 * The slice of a request these need: a form, and whose account it is.
 *
 * Named out rather than picked off SvelteKit's `RequestEvent`, because the
 * device's event is not one — it carries a user with an id and nothing else,
 * there being no session, no address and no verified mail behind it. Asking
 * for what is used is what lets one body serve both.
 */
type Event = {
	request: Request;
	locals: { user?: { id: string } | undefined };
};

export async function importTasksAction(event: Event) {
	const formData = await event.request.formData();

	try {
		const result = importTasks(buildCtx(event.locals.user!.id), {
			text: formData.get('text'),
			notebook: formData.get('notebook'),
			includeDone: formData.get('includeDone') === 'on'
		});

		// Everything it did and everything it did not: counts somebody can
		// check against the app they came from, and what was left behind.
		const brought = [
			result.importedTasks &&
				`${result.importedTasks} ${result.importedTasks === 1 ? 'task' : 'tasks'}`,
			result.importedNotes &&
				`${result.importedNotes} ${result.importedNotes === 1 ? 'note' : 'notes'}`
		]
			.filter(Boolean)
			.join(' and ');
		const parts = [`Imported ${brought} into “${result.notebook}”.`];
		if (result.datesDropped > 0) {
			parts.push(
				`${result.datesDropped} had a date this does not read — a repeat rule, or "tomorrow".`
			);
		}
		if (result.skipped.length > 0) {
			parts.push(`Left behind: ${result.skipped.slice(0, 5).join(', ')}.`);
		}

		return { success: true, action: 'importTasks', message: parts.join(' ') };
	} catch (e) {
		return toActionFailure(e);
	}
}

/**
 * What a restore would do, said before it does anything.
 *
 * The restore empties the account first, so everything worth knowing about the
 * file — whose it was, what lands, what is left behind, what the import would
 * refuse — has to be on the screen before the word REPLACE is typed, not in
 * the message after. Reads the same text the restore will read and writes
 * nothing.
 */
export async function previewImportAction(event: Event) {
	const formData = await event.request.formData();
	try {
		return { success: true, action: 'previewImport', preview: previewImport(formData.get('text')) };
	} catch (e) {
		return toActionFailure(e);
	}
}

/**
 * Put an exported account back — into this one, over what is here.
 *
 * Destructive, so it asks for a typed word rather than a click: this empties
 * the account before it fills it, and the one thing worse than an import that
 * fails is an import that half-succeeds over a real week. `importAccount` is
 * one transaction for the same reason.
 *
 * `keep` is where a copy of what is about to be destroyed was put, and it is
 * the one thing the two instances answer differently — a path beside the
 * database on a server, a file in somebody's downloads on a device.
 */
export async function importAccountAction(
	event: Event,
	keep: (userId: string, formData: FormData) => string | null
) {
	const formData = await event.request.formData();

	/*
	 * The word the screen asked for, in the language the screen was in.
	 *
	 * It is a catalogue string — a Portuguese page asks for SUBSTITUIR, a
	 * German one for ERSETZEN — and this compared what was typed against the
	 * literal 'REPLACE'. So doing exactly what the page said was refused in
	 * three of the four languages, in an English sentence, with no way through
	 * but guessing the English word.
	 *
	 * Both are accepted: the word this account's own language asks for, and the
	 * English one, which is what the docs and anything scripted will say.
	 *
	 * The translator serves everything else this answers with too — the import's
	 * reasons come back as message keys, a service having no translator of its
	 * own. From the account's own setting rather than `localeForUser`, which
	 * reads the instance's fallback out of `config.toml` and therefore out of
	 * `node:fs`: this file also runs in the browser, on an instance that is its
	 * own device. Somebody importing an account is signed in, so their setting
	 * is the answer whenever there is one.
	 */
	const t = await translatorFor(getLocale(event.locals.user!.id) ?? SOURCE_LOCALE);
	const asked = t('settings.account.import.rEPLACE').trim().toUpperCase();
	const typed = String(formData.get('confirm') ?? '')
		.trim()
		.toUpperCase();

	if (typed !== asked && typed !== 'REPLACE')
		return fail(400, {
			message: t('accountImport.typeToConfirm', { word: t('settings.account.import.rEPLACE') })
		});

	try {
		const result = await importAccount(event.locals.user!.id, formData.get('text'), {
			// Only meaningful when the preview said some rows would be refused
			// and the person read that and chose to go on without them.
			dropUnacceptable: formData.get('dropUnacceptable') === 'on',
			rescue: keep(event.locals.user!.id, formData)
		});

		const parts = [
			result.from
				? t('accountImport.importedFrom', { total: result.total, email: result.from.email })
				: t('accountImport.imported', { total: result.total })
		];
		if (result.skipped.length > 0) {
			parts.push(
				t('accountImport.leftBehind', {
					what: result.skipped.map((s) => `${s.name} (${t(s.why)})`).join('; ')
				})
			);
		}

		return { success: true, action: 'importAccount', message: parts.join(' ') };
	} catch (e) {
		return toActionFailure(e);
	}
}
