<!-- title: Using it with AI agents -->
<!-- blurb: pointing Claude, or any other AI agent that speaks MCP, at your own instance -->

# Using it with AI agents

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server: the same API tokens, the same scopes, and a set of tools a model can
call. It is what "put that on my to-do list" means when the thing being asked is
an AI agent rather than the app.

## The short version

Make a key: **Settings → AI & Integrations → AI → Make a key**. It is shown
once, so keep the tab open while you do the rest.

Then paste this to the assistant, with your key in place of the last line:

```text
I use ontoplano — a life management app my assistant can connect to.
Please connect to it and use it whenever I ask you about my week, my to-do
list, my diary, my notebooks, my shopping list or my recipes.

  Address:    https://app.ontoplano.com/api/mcp
  Protocol:   MCP, over streamable HTTP (stateless — no session, no GET)
  Key:        send it as an "Authorization: Bearer" header

Once you are connected, tell me what is on my plan today. Do not change
anything in my account until I ask you to.

Key: onto_YOUR_KEY_HERE
```

Your own instance answers at `https://your-host/api/mcp` — the address you type
into the browser, with `/api/mcp` after it.

Two things the prompt does on purpose. It names what the app is _for_, so the
assistant reaches for it instead of asking you to repeat yourself; and it says
not to write anything yet, so the first thing it does is show you what it can
see rather than what it has done.

## Setting it up properly

Pasting the prompt works when the assistant can set itself up — it has a
terminal, so it writes its own configuration. A chat window cannot, and neither
can most editors: those want a line in a configuration file.

It is also the better answer when you mean to keep it. A server named in a
config file is there in every conversation without pasting anything, and the
key sits in that file rather than in a transcript you might later share.

Each client keeps its configuration somewhere different, and in a different
shape.

**Claude Code** — one command, and it writes the config for you:

```sh
claude mcp add --transport http ontoplano https://app.ontoplano.com/api/mcp \
  --header "Authorization: Bearer onto_YOUR_KEY_HERE"
```

**Codex CLI** — `~/.codex/config.toml`. It reads the key out of the
environment rather than out of the file, so export it in the shell that starts
Codex:

```toml
[mcp_servers.ontoplano]
url = "https://app.ontoplano.com/api/mcp"
bearer_token_env_var = "ONTOPLANO_KEY"
```

```sh
export ONTOPLANO_KEY=onto_YOUR_KEY_HERE
```

`codex mcp list` says whether it connected.

**Cursor** — `~/.cursor/mcp.json`, where the header is written out in full:

```json
{
  "mcpServers": {
    "ontoplano": {
      "url": "https://app.ontoplano.com/api/mcp",
      "headers": { "Authorization": "Bearer onto_YOUR_KEY_HERE" }
    }
  }
}
```

**Claude Desktop** — the awkward one. Its custom-connector screen asks for an
OAuth client id and secret and has nowhere to put a key, so a bearer key needs
`mcp-remote` in between, which speaks to the app for it:

```json
{
  "mcpServers": {
    "ontoplano": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://app.ontoplano.com/api/mcp",
        "--header",
        "Authorization:Bearer onto_YOUR_KEY_HERE"
      ]
    }
  }
}
```

No space after the colon in that last line — Claude Desktop does not escape
spaces inside an argument, and the header arrives cut in half if you leave one.

Restart the client after editing its file. If it lists ontoplano's tools, it
worked.

## Blocks and to-dos are different things

Worth knowing before you ask for anything, because it is the one distinction an
assistant gets wrong: a **to-do** is something to do with no hour attached, and a
**block** is an hour. "Ring the dentist" is a to-do; "deep work from 9 to 11" is
a block.

An assistant that only has `add_todo` answers the second by writing the time
into the title — `deep work 09:00–11:00` — and your day still looks empty. With
`schedule:write` it puts a real block on the day, and it can answer for the ones
already there:

> Skip the gym and the stretching today, and put deep work on from 9 to 11.

`finish_block` takes both answers. **Skipped is a real answer**, not a failure to
record one — a week that can only be told about the parts that went well is a
week that starts lying by the second one.

It can also change what is there, which matters more than it sounds:

> Push the study block to four, and put down that I was actually organizing
> my bird pictures for the last hour and a half.

`change_block` moves and renames; `cancel_block` takes something off a day
because it is not happening. **Cancelled is not skipped.** Skipped means you
meant to do it and did not, and the weekly review asks about it; cancelled means
the plan was wrong — the meeting moved, the class was called off. Without both,
an assistant asked to move something has only one way to clear the old one off
the grid, and it will use the wrong one: this is not hypothetical, it is what
happened, and the day ended up holding a duplicate block and a skip that never
took place.

Everything here is **that day only**. Moving this Thursday's gym never moves gym:
the occurrence is detached and the weekly plan is left alone, which is the same
thing alt-dragging it in the app does.

## How it behaves

Six things are worth knowing before you grant a token:

**It offers only what the token holds.** `tools/list` is filtered by scope, so a
token with `today:read` and nothing else is offered one tool. The scope is
checked again on every call, because a client that was never offered a tool can
still name one.

**Nothing in it is new behaviour.** Every tool calls the same service function
the web page calls, so the ceilings, the validation and the ownership checks are
the ones that already exist. A tool cannot be a way around a rule.

**It is stateless.** No session, no event stream, no state between calls — every
request carries its own token and is answered on its own. A `GET` answers 405,
because there is no server-initiated stream to open.

**A refusal is an answer.** A service saying "that is not a date" comes back as
tool content the model can read and act on, not as a protocol error it can only
give up on.

**Deleting is its own grant.** A write scope lets a token add and change; the
tools that remove a row for good also demand the `destructive` grant, one tick
on the token form. A wrong write is data that is wrong, a wrong delete is data
that is gone, and they are not the same thing to hand an assistant. Without the
grant those tools are not offered at all.

**Every mutation answers with what it replaced.** The result of a write carries
`before` and `after` — the thing as it was and as it is, and for a delete the
whole removed row. A bad call is reversible from the conversation itself: the
model, or you reading over its shoulder, can see exactly what to put back.

The tools are declared in one file — `src/lib/server/mcp/tools.ts` — and each
carries the sentence a model reads to decide whether it is the thing it wants.
[The tools](#the-tools) below lists every one, generated from that file, with
the scope each needs.

## Making the key

Settings → AI & Integrations → AI → **Make a key**. Every permission the tools
use is ticked to begin with — reading and writing, never deleting. Untick what
you would rather it did not see: a tool whose permission was not granted is not
offered to the assistant at all, so one holding a read-only key does not know
that `add_todo` exists.

Deleting is not on that form. The **Integrations** tab beside it has the full
one, with every permission including `destructive`, for a key meant to run a
script rather than an assistant.

A key is shown once, on the screen where you made it. It is revoked from the
Integrations tab, and revoking takes effect on the next request — there is no
session to expire.

## What an upgrade will not break

The tool surface is **additive within a major version**: a tool or a parameter
is never removed, a parameter never becomes required, and an enum never loses
a value without a release in between that marked it deprecated — the
deprecated shape keeps working for that release, and its description names the
replacement. So a saved prompt or a wrapper script written against one version
survives the next; what worked keeps working, and new things appear beside it.

This is enforced, not promised: the surface is snapshotted in
`src/lib/server/mcp/manifest.json` and the test suite refuses any change that
would break an existing caller. The server names its own app version in the
`initialize` handshake, so "it broke when I upgraded" can always say from what
to what.

## The tools

Every tool the server offers, with the exact description a model is handed —
published from the same array that serves them, so the two cannot drift. A
token is only offered the tools its scopes reach: a tool missing from
`tools/list` is a permission not granted, not a feature that does not exist.
The scopes themselves are on [the permissions page](permissions.md).

<!-- generated: mcp-tools -->
