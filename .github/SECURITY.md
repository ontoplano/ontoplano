# Reporting a security problem

**Do not open a public issue.** Use
[a private security advisory](https://github.com/ontoplano/ontoplano/security/advisories/new),
which is visible only to the maintainers until there is a fix.

That link needs **private vulnerability reporting** switched on for the
repository — Settings → Advanced Security → Private vulnerability reporting. It
is off by default and the link 404s until it is on, which reads to a reporter as
"this project does not want to hear from me". If it does not work, say so in an
issue with no detail in it — "I have something for you, privately" — and I will
open a channel.

I am one person, so an honest expectation rather than a promise: I will
acknowledge within a few days and tell you what I think and when I can fix it.
If it is serious and I have gone quiet for two weeks, disclose it — a silent
maintainer is not a reason to leave people exposed.

## What is worth reporting

Ontoplano is a multi-account app with one database, so the things that matter
most are the ones that cross between accounts:

- Reading or writing another account's rows — the shape this app guards against
  hardest, and the one `e2e/idor.e2e.ts` exists for.
- Anything that lets a request act as somebody else: session handling,
  the invitation flow, password reset, the admin role, impersonation.
- An API token doing more than its scopes allow, or a plugin reaching past them.
- A stored value reaching a page as markup or as a `style` without being
  checked.
- Anything that reads a file, or makes a request, from a path a user controls.

## What is not

- A finding from a scanner with no working path to abuse it. Say what an
  attacker actually gets.
- Missing headers on the marketing site, which is static HTML and has no
  session.
- Rate limits you got past by using several addresses.
- Self-XSS, or anything needing physical access to an unlocked phone.

## If you run your own instance

Two settings are the difference between a locked door and an open one, and
neither has a safe default:

- `ORIGIN` must be the address people actually type. It is the whole of the
  CSRF defence here — there are no tokens.
- `BETTER_AUTH_SECRET` signs sessions. Generate it; never share one between
  instances.

`docs/reference/configuration.md` is the full list.
