<!-- title: Permissions -->
<!-- blurb: the one scope system every way in shares — what each grant hands over, and which tools sit behind it -->

# Permissions

There is one permission system, and everything outside the app uses it: the
[REST API](api.md), the [MCP server](ai-agents.md) an assistant speaks, and
the calendar link. A token holds scopes; every endpoint and every tool names
the one it needs; the two are compared on every call. There is no second
model to keep in step and no grant that means different things at different
doors.

Three habits shape the list. **Reading and writing are separate grants** — a
token that reports your day cannot rewrite it. **Deleting is separate again**:
the tools that remove a row for good need the `destructive` grant on top of
the room's own write scope, because a wrong write is data that is wrong and a
wrong delete is data that is gone. And **each sentence is what the person
consents to**: the key is for developers, the sentence is for whoever owns the
data, and the picker shows the sentence.

Grant the narrowest set that works. A token lives on a phone, in a config
file, in somebody else's service — what it cannot read cannot leak.

## Tying a key to one thing

A scope is about the account: `tasks:write` is every to-do there is. The thing
people usually want to hand an assistant is narrower than that — work on *this*
project with me — so a key can also be tied to a single notebook. Such a key
sees that notebook, the tasks and goals filed under it, and the notes written
in it. Everything else in the account is not refused to it; it is not there.

The narrowing is not a filter the tools apply. Each tool declares which of its
arguments name a thing and what kind, and the id is resolved against the rows
that key can list — which for a tied key is the contents of its one notebook.
So a tool that would be about the account rather than a thing, `diary` or
`goals`, is not offered to it at all, and the permissions it can still be
granted are only the rooms its notebook reaches. Asking it about a different
notebook is answered about its own: a refusal that depended on the other
notebook existing would be a way to ask what the account has, one number at a
time.

Choose it where the key is made, above the permissions: **What it may work on**.

One thing to know before granting a `:write` on its own: writing does **not**
imply reading, and most changes name the thing they change by the id the
matching read handed out. `tasks:write` alone can add a todo and cannot find
the todo you asked it to finish. Where naming a thing is unambiguous the write
tool takes a name instead — `tick_habit` accepts `"stretching"` — so
`habits:write` on its own is a usable grant. Everywhere else, pair the two.
The token form says so under the tick rather than leaving you to find out from
an assistant that cannot do what you asked.

<!-- generated: permissions -->

The REST side of the same table — which endpoint asks for which scope — is
generated into [the API page](api.md).
