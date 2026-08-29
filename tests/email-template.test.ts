/**
 * One mail shape for everything the app sends.
 *
 * The properties that matter: the text part carries the link (it is what the
 * no-SMTP log path prints), the HTML shows the raw URL beside the button
 * (a button hiding its destination is what phishing looks like), and
 * everything interpolated is escaped — the change-address mail carries an
 * address the user typed.
 */
import { describe, expect, test } from 'vitest';
import { renderEmail } from '../src/lib/server/email-template';

describe('renderEmail', () => {
	test('the text part carries the message and the link', () => {
		const mail = renderEmail({
			subject: 'Confirm your ontoplano address',
			lines: ['Confirm this address belongs to you.'],
			action: { label: 'Confirm address', url: 'https://example.com/verify?t=abc' },
			small: ['If this was not you, ignore this message.']
		});
		expect(mail.text).toContain('Confirm this address belongs to you.');
		expect(mail.text).toContain('https://example.com/verify?t=abc');
		expect(mail.text).toContain('ignore this message');
	});

	test('the HTML shows the raw URL as text, not only behind the button', () => {
		const url = 'https://example.com/verify?t=abc';
		const mail = renderEmail({ subject: 's', lines: ['x'], action: { label: 'Go', url } });
		const timesShown = mail.html.split(url).length - 1;
		expect(timesShown).toBeGreaterThanOrEqual(2);
	});

	test('interpolated content is escaped in the HTML', () => {
		const mail = renderEmail({
			subject: 's',
			lines: ['Change this address to <script>alert(1)</script>@x.com.']
		});
		expect(mail.html).not.toContain('<script>');
		expect(mail.html).toContain('&lt;script&gt;');
		expect(mail.text).toContain('<script>');
	});

	test('no action, no button', () => {
		const mail = renderEmail({ subject: 's', lines: ['Just words.'] });
		expect(mail.html).not.toContain('<a href');
	});
});
