/**
 * Sending email, or honestly admitting that it cannot.
 *
 * Password reset is useless without a transport, but requiring SMTP to run the
 * app at all would be hostile to anyone self-hosting for themselves. So the
 * transport is optional and the failure mode is explicit: with SMTP configured
 * the message is sent; without it the message is written to the server log,
 * including the link, so a single-user install still works and the operator can
 * see exactly what would have gone out.
 *
 * What it never does is fail silently. A reset that reports success while
 * sending nothing is how people end up locked out believing the mail is on its
 * way.
 */
import { createTransport, type Transporter } from 'nodemailer';

export type Email = {
	to: string;
	subject: string;
	text: string;
	/** The templated body (email-template.ts); the text stays the log's copy. */
	html?: string;
};

type Config = {
	host: string;
	port: number;
	secure: boolean;
	user?: string;
	pass?: string;
	from: string;
};

function readConfig(): Config | null {
	const host = process.env.SMTP_HOST;
	const from = process.env.SMTP_FROM;
	if (!host || !from) return null;

	const port = Number(process.env.SMTP_PORT ?? 587);
	return {
		host,
		port: Number.isFinite(port) ? port : 587,
		// Implicit TLS on 465, STARTTLS elsewhere — the usual convention, and
		// overridable for a server that disagrees.
		secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
		user: process.env.SMTP_USER,
		pass: process.env.SMTP_PASS,
		from
	};
}

let transporter: Transporter | null = null;
let configured: Config | null = null;

function getTransport(): { transport: Transporter; config: Config } | null {
	const config = readConfig();
	if (!config) return null;

	// Rebuild if the environment changed under us; otherwise reuse the pool.
	if (!transporter || JSON.stringify(config) !== JSON.stringify(configured)) {
		transporter = createTransport({
			host: config.host,
			port: config.port,
			secure: config.secure,
			auth: config.user ? { user: config.user, pass: config.pass } : undefined
		});
		configured = config;
	}

	return { transport: transporter, config };
}

export function isEmailConfigured(): boolean {
	return readConfig() !== null;
}

export type SendResult = { delivered: boolean; reason?: string };

export async function sendEmail(email: Email): Promise<SendResult> {
	const ready = getTransport();

	if (!ready) {
		// Not an error: a self-hosted single-user install has no reason to run a
		// mail server. The link is logged so it is still usable.
		console.info(
			`[email] SMTP not configured; not sending.\n` +
				`  to:      ${email.to}\n` +
				`  subject: ${email.subject}\n` +
				`  body:\n${email.text.replace(/^/gm, '    ')}`
		);
		return { delivered: false, reason: 'SMTP is not configured on this server' };
	}

	try {
		await ready.transport.sendMail({
			from: ready.config.from,
			to: email.to,
			subject: email.subject,
			text: email.text,
			html: email.html
		});
		return { delivered: true };
	} catch (e) {
		// Logged rather than thrown: the caller must not leak whether an address
		// exists, and a failed send should not look different from a successful
		// one to whoever asked.
		console.error('[email] send failed:', e instanceof Error ? e.message : e);
		return { delivered: false, reason: 'The server could not send the message' };
	}
}
