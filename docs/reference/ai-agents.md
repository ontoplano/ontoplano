<!-- Written by hand in docs/prose/ai-agents.md — edit that file, then run `yarn docs`.
     The tables below marked "generated" come from the code itself. -->

# Using it with AI agents

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server: the same API tokens, the same scopes, and a set of tools a model can
call. It is what "put that on my todo list" means when the thing being asked is
an AI agent rather than the app.

## The short version

Make a token (Settings → Integrations → **New token**, then the **An AI
assistant (MCP)** button), then hand it to whatever you are using.

**Claude Code, Codex, or anything else with a shell** — one command:

```sh
claude mcp add --transport http ontoplano https://app.ontoplano.com/api/mcp \
  --header "Authorization: Bearer onto_YOUR_TOKEN_HERE"
```

**Or just ask, in words.** Paste this to the assistant, with your token in
place of the last line, and let it do the setting up:

```text
I use ontoplano — a life management app with an MCP server. Please connect to it
and use it whenever I ask you about my week, my todos, my diary, my notebooks,
my shopping list or my recipes.

  MCP endpoint:  https://app.ontoplano.com/api/mcp
  Transport:     streamable HTTP (stateless — no session, GET is not supported)
  Auth:          an Authorization: Bearer header

Once connected, list the tools you were offered and tell me what I asked you to
do today. Do not write anything into my account until I ask you to.

Token: onto_YOUR_TOKEN_HERE
```

Your own instance answers at `https://your-host/api/mcp` — the address is the
one you type into the browser, with `/api/mcp` after it.

Two things the prompt is doing on purpose. It names what the app is _for_, so
the assistant reaches for it instead of asking you to repeat yourself; and it
says not to write anything yet, so the first thing it does is show you what it
can see rather than what it has done.

## How it behaves

Four things are worth knowing before you grant a token:

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

The tools are declared in one file, `src/lib/server/mcp/tools.ts`, and each one
carries the sentence a model reads to decide whether it is the thing it wants.

## What it can do

The tools are declared in one file — `src/lib/server/mcp/tools.ts` — and each
carries the sentence a model reads to decide whether it is the thing it wants.
As it stands:

| Tool                                                   | Scope it needs                     | What it is for                           |
| ------------------------------------------------------ | ---------------------------------- | ---------------------------------------- |
| `today`                                                | `today:read`                       | The blocks and tasks on today            |
| `habits`                                               | `habits:read`                      | Today's habits, and which are kept       |
| `upcoming`                                             | `schedule:read`                    | The days ahead, in order                 |
| `search`                                               | `search:read`                      | One search over everything written       |
| `todos`, `add_todo`, `finish_todo`, `schedule_todo`    | `tasks:read` / `tasks:write`       | The todo list, and putting one on a day  |
| `goals`                                                | `tasks:read`                       | What you are working towards             |
| `diary`, `write_entry`, `notebooks`                    | `notes:read` / `notes:write`       | Entries, and the subjects they belong to |
| `ideas`, `add_idea`                                    | `notes:read` / `notes:write`       | Things caught before they evaporated     |
| `shopping_list`, `add_to_shopping_list`, `tick_bought` | `shopping:read` / `shopping:write` | To buy, and the cupboard                 |
| `recipes`, `add_recipe`                                | `kitchen:read` / `kitchen:write`   | The cookbook, ingredients included       |

## Making the token

Settings → Integrations → **New token**. There is a button on that form called
**An AI assistant (MCP)** which ticks exactly the scopes in the table above.
Grant fewer if you want it to read and not write: the tools it was not granted
are not offered to it at all, so an assistant with a read-only token does not
know that `add_todo` exists.

The token is shown once, on the screen where you made it, with a link back to
this page. It is revoked from the same place, and revoking it takes effect on
the next request — there is no session to expire.
