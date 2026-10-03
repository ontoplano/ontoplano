/**
 * The one shape every mail the app sends has.
 *
 * Four different hand-assembled strings had four different voices; a person
 * getting two of them would reasonably wonder if both were real. This is the
 * app's banner discipline applied to mail: one quiet card, the wordmark, the
 * message in sentences, at most one button — and the raw link printed under
 * it, because a mail that hides its destination behind a button is exactly
 * what phishing looks like.
 *
 * The text part stays first-class, not a fallback: without SMTP configured
 * the transport logs it, link included, and that path must keep working.
 */

/**
 * A sentence with a link inside it: `{link}` in `text` is where `label` goes,
 * pointing at `url`. Written as a sentence rather than a bare address, which
 * is what a mail somebody reads for pleasure should look like.
 */
export type MailLink = { text: string; label: string; url: string };

export type MailContent = {
	subject: string;
	/** A headline above everything else. */
	title?: string;
	/** One paragraph per entry, in plain sentences. */
	lines: string[];
	/** A short list after the paragraphs, under its own heading. */
	list?: { heading: string; items: string[] };
	/** A closing sentence with a link in it, after the list. */
	link?: MailLink;
	/** The one thing to click, when there is one. */
	action?: { label: string; url: string };
	/** The small print after the action — expiries, what ignoring it means. */
	small?: (string | MailLink)[];
};

const escapeHtml = (value: string) =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

export function renderEmail(content: MailContent): {
	subject: string;
	text: string;
	html: string;
} {
	const { subject, title, lines, list, link, action, small = [] } = content;

	const linkText = (one: string | MailLink) =>
		typeof one === 'string' ? one : one.text.replace('{link}', `${one.label} (${one.url})`);
	const linkHtml = (one: string | MailLink) => {
		if (typeof one === 'string') return escapeHtml(one);
		const [before, after = ''] = one.text.split('{link}');
		return `${escapeHtml(before)}<a href="${escapeHtml(one.url)}" style="color:inherit;">${escapeHtml(one.label)}</a>${escapeHtml(after)}`;
	};

	const text = [
		title ?? '',
		lines.join('\n\n'),
		list ? [list.heading, ...list.items.map((item) => `- ${item}`)].join('\n') : '',
		link ? linkText(link) : '',
		action ? action.url : '',
		small.map(linkText).join(' ')
	]
		.filter(Boolean)
		.join('\n\n');

	const headline = title
		? `<p style="margin:0 0 16px; font-size:22px; font-weight:700; line-height:1.3; color:#111827;">${escapeHtml(title)}</p>`
		: '';
	const listed = list
		? `<h3 style="margin:8px 0 8px; font-size:15px; font-weight:700; color:#111827;">${escapeHtml(list.heading)}</h3>
			<ul style="margin:0 0 16px; padding-left:20px; font-size:15px; line-height:1.6; color:#111827;">
				${list.items.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join('\n')}
			</ul>`
		: '';
	const closing = link
		? `<p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#111827;">${linkHtml(link)}</p>`
		: '';

	const paragraph = (line: string) =>
		`<p style="margin:0 0 16px; font-size:15px; line-height:1.6; color:#111827;">${escapeHtml(line)}</p>`;

	const button = action
		? `<p style="margin:8px 0 12px;">
				<a href="${escapeHtml(action.url)}"
					style="display:inline-block; background:#111827; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:11px 22px;">
					${escapeHtml(action.label)}</a>
			</p>
			<p style="margin:0 0 20px; font-size:12px; line-height:1.5; color:#6b7280; word-break:break-all; font-family:ui-monospace,Menlo,Consolas,monospace;">
				${escapeHtml(action.url)}</p>`
		: '';

	const smallPrint = small
		.map(
			(line) =>
				`<p style="margin:0 0 8px; font-size:13px; line-height:1.5; color:#6b7280;">${linkHtml(line)}</p>`
		)
		.join('\n');

	// Tables and inline styles, because mail clients render like it is 2003.
	// One light theme on purpose: dark-mode mail rendering is client roulette,
	// and a white card reads fine in both.
	const html = `<!doctype html>
<html>
<body style="margin:0; padding:0; background:#f3f4f6;">
	<div style="display:none; max-height:0; overflow:hidden;">${escapeHtml(lines[0] ?? title ?? subject)}</div>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6; padding:32px 12px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
		<tr><td align="center">
			<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px; width:100%; background:#ffffff; border:1px solid #e5e7eb; border-top:3px solid #111827;">
				<tr><td style="padding:28px 32px 24px;">
					<p style="margin:0 0 24px; font-size:17px; font-weight:700; letter-spacing:-0.01em; color:#111827;">ontoplano</p>
					${headline}
					${lines.map(paragraph).join('\n')}
					${listed}
					${closing}
					${button}
					${smallPrint}
				</td></tr>
			</table>
			<p style="margin:16px 0 0; font-size:12px; color:#9ca3af;">ontoplano</p>
		</td></tr>
	</table>
</body>
</html>`;

	return { subject, text, html };
}
