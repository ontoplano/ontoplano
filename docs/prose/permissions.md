<!-- title: Permissions -->
<!-- blurb: the one scope system every way in shares — what each grant hands over, and which tools sit behind it -->

# Permissions

There is one permission system, and everything outside the app uses it: the
[REST API](api.md), the [MCP server](ai-agents.md) an assistant speaks, and
the calendar link. A token holds scopes; every endpoint and every tool names
the one it needs; the two are compared on every call. There is no second
model to keep in step and no grant that means different things at different
doors.

Two habits shape the list. **Reading and writing are separate grants** — a
token that reports your day cannot rewrite it. And **each sentence is what
the person consents to**: the key is for developers, the sentence is for
whoever owns the data, and the picker shows the sentence.

Grant the narrowest set that works. A token lives on a phone, in a config
file, in somebody else's service — what it cannot read cannot leak.

<!-- generated: permissions -->

The REST side of the same table — which endpoint asks for which scope — is
generated into [the API page](api.md).
