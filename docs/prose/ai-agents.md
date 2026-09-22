<!-- title: Using it with AI agents -->
<!-- blurb: pointing Claude, Codex or anything else that speaks MCP at your own instance -->

# Using it with AI agents

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server: the same keys and the same permissions as the API, and a set of tools a
model can call. It is what "put that on my to-do list" means when the thing
being asked is an assistant rather than the app.

The examples below use `https://app.ontoplano.com`. Your own instance answers at
`https://your-host/api/mcp` — the address you type into the browser, with
`/api/mcp` after it.

## The chat inside the app

You do not need an external assistant to use the tools. **Settings → AI &
Integrations → Chat** takes a provider — Anthropic, OpenAI, OpenRouter or
Ollama — and a key of your own, and the app gains a chat that speaks through
the same tool surface described on this page, with the same permissions: it
reads and writes, every write lands in the same log, and deleting is a box on
that tab it does not start with. Remove the key and the chat is gone.
Without a key there is no chat anywhere in the app, and nothing ever calls a
model on your behalf.

It is not on the on-device instance — the chat dials the provider from the
server the instance runs on. On a phone, point any MCP client at the instance
you sync with instead.

### Which model

You do not have to know. Paste the key, press **Ask the provider what it
offers**, and the box becomes a list of what that key can actually reach —
which is also the quickest way to find out whether the key works before you
save it. Anthropic and OpenAI name a current model as the default if you pick
nothing; OpenRouter and Ollama have no sensible default, so they ask.

There is a "type a model name instead" for a model released this morning that
the provider's own list has not caught up with. It is the exception, not the
way in.

### Getting a key

Each of these is a company you have an account with, and the key is billed to
that account rather than to anything here. Ontoplano never holds a provider
account of its own.

<!-- tabs -->

#### Anthropic

1. Go to **[console.anthropic.com](https://console.anthropic.com)** and sign in.
   This is the developer console, and it is a different thing from a Claude
   subscription: **paying for Claude Pro does not give you API credit**, which
   is the step most people are missing when the key they just made says it has
   no balance.
2. **Plans & Billing → Buy credits.** A few dollars is a great deal of chat.
3. **API keys → Create Key.** Copy it — the console shows it once.
4. Paste it into Settings → AI & Integrations → Chat, and ask for the models.

A key looks like `sk-ant-api03-…`.

#### OpenAI

1. Go to **[platform.openai.com](https://platform.openai.com)** and sign in.
   The same caution applies: a ChatGPT Plus subscription is not API credit, and
   the two are billed separately.
2. **Settings → Billing** and add a payment method or buy credit.
3. **API keys → Create new secret key.** Copy it; it is shown once.

A key looks like `sk-proj-…` or `sk-…`.

#### OpenRouter

One account in front of most of the others, which is the reason to pick it: you
can try a model from a company you have no account with.

1. Go to **[openrouter.ai](https://openrouter.ai)** and sign in.
2. **Credits** — add some, or use one of the free models the list marks as such.
3. **Keys → Create Key.**

A key looks like `sk-or-v1-…`. Models are named `company/model`, which is why
its list is the long one.

#### Ollama

No key and no account: it runs on a machine you have. Install it from
**[ollama.com](https://ollama.com)**, `ollama pull llama3.3`, and point the
address at it — `http://127.0.0.1:11434/v1` if it is the same machine as the
instance.

The instance dials that address from wherever it runs, so an Ollama on your
laptop is not reachable by an instance on a server somewhere else.

<!-- /tabs -->

## Make a key

**Settings → AI & Integrations → AI → Make a key.** It is shown once, so keep
the tab open while you set the assistant up.

Every permission the tools use is ticked to begin with: reading and writing,
never deleting. Untick what you would rather it did not see — a tool whose
permission was not granted is not offered to the assistant at all, so a
read-only key does not know that `add_todo` exists.

Deleting is not on that form. The **Integrations** tab beside it has the full
one, including `destructive`, for a key meant to run a script rather than an
assistant. Keys are revoked there too, and a revoked key stops working on the
next request.

## Connect it

<!-- tabs -->

### Just tell it

Any assistant with a terminal can set itself up. Paste this, with your key in
place of the last line:

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

It names what the app is for, so the assistant reaches for it instead of asking
you to repeat yourself, and it says not to write anything yet.

### Claude

**The plugin.** Two lines inside Claude Code, and the shortest route:

```sh
/plugin marketplace add ontoplano/claude-plugin
/plugin install ontoplano@ontoplano
```

It asks for the address of your ontoplano and a key when it installs, and keeps
the key in the system keychain rather than in a file. It also brings `/today`,
`/week` and `/capture`, and the standing instructions an assistant otherwise
needs told every conversation: read before writing, say what you changed.

**The command line.** One command, and it writes the configuration:

```sh
claude mcp add --scope user --transport http ontoplano https://app.ontoplano.com/api/mcp \
  --header "Authorization: Bearer onto_YOUR_KEY_HERE"
```

`--scope user` is what makes it permanent everywhere. Without it the server is
written into whichever project you were standing in.

**Claude Desktop.** Its connector screen asks for an OAuth client id and has
nowhere to put a key, so this goes through `mcp-remote`:

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

No space after that colon: Desktop does not escape spaces inside an argument,
and the header arrives cut in half if you leave one.

### Codex

`~/.codex/config.toml`. It reads the key out of the environment rather than out
of the file:

```toml
[mcp_servers.ontoplano]
url = "https://app.ontoplano.com/api/mcp"
bearer_token_env_var = "ONTOPLANO_KEY"
```

An export lasts as long as the shell it was typed into, so put it in the file
your shell starts from:

```sh
echo 'export ONTOPLANO_KEY=onto_YOUR_KEY_HERE' >> ~/.bashrc   # zsh: ~/.zshrc
```

`codex mcp list` says whether it connected.

### Cursor

`~/.cursor/mcp.json`, where the header is written out in full:

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

<!-- /tabs -->

Restart the client after editing its file. If it lists ontoplano's tools, it
worked.

## Blocks and to-dos are different things

A **to-do** is something to do with no hour attached; a **block** is an hour.
"Ring the dentist" is a to-do, "deep work from 9 to 11" is a block. An assistant
that only has `add_todo` answers the second by writing the time into the title,
and your day still looks empty.

With `schedule:write` it puts a real block on the day and can answer for the
ones already there. `finish_block` takes both answers, and **skipped is a real
answer** — a week that can only be told about the parts that went well starts
lying by the second one.

`change_block` moves and renames; `cancel_block` takes something off a day.
**Cancelled is not skipped**: skipped means you meant to do it and did not, and
the weekly review asks about it; cancelled means the plan was wrong. An
assistant with only one of them uses the wrong one when it moves something.

All of it is that day only. Moving this Thursday's gym never moves gym, which
is what alt-dragging it in the app does too.

## The pictures and recordings in what it reads

A note, a task and an idea can all hold a picture or a recording, and what a
tool hands back is the markdown that refers to it: `![the wall](/media/31)`,
`[said](/media/audio/44)`. The **`media`** tool turns that link into the file
itself — hand it the link exactly as the writing writes it, and the picture
comes back as a picture:

```json
{ "name": "media", "arguments": { "path": "/media/31" } }
```

`/media/audio/44` for a recording. The same file is also an ordinary HTTP
request, for a script that holds the key itself rather than speaking the
protocol:

```sh
curl -H "Authorization: Bearer $ONTOPLANO_KEY" \
  https://your-instance/media/31 --output picture.png
```

Both doors ask the same question, and the answer is the permission that reads
the thing the file is in.

A picture in a note wants `notes:read`, one on a task `tasks:read`, a face
`people:read`, a recipe photograph `kitchen:read`. There is no separate media
grant — a file answers to whatever refers to it, and one that nothing refers
to answers to nobody. A key tied to one notebook reaches the files inside that
notebook and no others.

Anything the key may not reach is a **404**, the same as an id that never
existed, so there is nothing to learn by walking the numbers.

## How it behaves

- **It offers only what the key holds.** `tools/list` is filtered by permission,
  and the permission is checked again on every call.
- **Nothing in it is new behaviour.** Every tool calls the same function the web
  page calls, so the same limits, validation and ownership checks apply.
- **It is stateless.** No session and no event stream: every request carries its
  own key, and a `GET` answers 405.
- **A refusal is an answer.** "That is not a date" comes back as tool content the
  model can read and act on, not as a protocol error.
- **Deleting is its own permission.** Tools that remove a row for good need the
  `destructive` grant, and without it they are not offered at all.
- **Every write answers with what it replaced** — `before` and `after`, and for a
  delete the whole removed row — so a bad call can be put back from the
  conversation itself. Two exceptions say so in their own description:
  `tag_todo` answers with the labels and nothing else, because two copies of a
  task to report one label is most of what marking a list costs, and the
  person's own copy of the change is in the log under Settings → Integrations
  either way.
- **A listing answers with a line.** A task comes back as what it is, where it
  stands and its labels; a note as its name, its labels and an opening.
  `verbose: true` gives the whole row, and `fields: "title,notes"` gives
  exactly those. This is a budget, not a limit: a model reading a list to find
  one thing pays for forty rows it will not use, three times over — on the way
  in, on the way out, and again next turn.
- **A line says what the row is about, and names the pictures it refers to.**
  A task's line carries an opening of its notes and the links in them; a note's
  line the same. `media` fetches one when it turns out to matter — a list is
  rarely read for its pictures, and always read to find something.
- **A list can be asked for narrowly.** `status`, `tag`, `withoutTag` and
  `taggedSince` on the task list; `tag` and `taggedSince` on notes. The date
  read is the label's own — it does not move when the thing is edited — so
  "what went into review since this morning" is one call.
- **`up_next` answers what to do next**, by the ratings on the tasks
  themselves: most urgent first, ties broken by higher energy and then higher
  interest.

The surface is additive within a major version: a tool or a parameter is not
removed, a parameter does not become required, and an enum does not lose a value
without a release in between that marks it deprecated. That is enforced by
`src/lib/server/mcp/manifest.json` and a test that refuses any change breaking an
existing caller.

## The tools

Every tool the server offers, with the exact description a model is handed —
published from the same array that serves them, so the two cannot drift. A key
is only offered the tools its permissions reach. The permissions themselves are
on [the permissions page](permissions.md).

<!-- generated: mcp-tools -->
