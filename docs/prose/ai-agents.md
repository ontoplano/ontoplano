<!-- title: Using with AI agents -->
<!-- blurb: pointing Claude, or any other AI agent that speaks MCP, at your own instance -->

# Using with AI agents

`POST /api/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io)
server: the same API tokens, the same scopes, and a set of tools a model can
call. It is what "put that on my todo list" means when the thing being asked is
an AI agent rather than the app.

Point a client at it with an ordinary bearer token. In Claude Code:

```sh
claude mcp add --transport http ontoplano https://app.ontoplano.com/api/mcp \
  --header "Authorization: Bearer onto_…"
```

Four things about it are worth knowing before you grant a token:

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
| `today`                                                | `today:read`                       | The blocks, habits and tasks on today    |
| `upcoming`                                             | `schedule:read`                    | The days ahead, in order                 |
| `search`                                               | `search:read`                      | One search over everything written       |
| `todos`, `add_todo`, `finish_todo`, `schedule_todo`    | `tasks:read` / `tasks:write`       | The todo list, and putting one on a day  |
| `goals`                                                | `tasks:read`                       | What you are working towards             |
| `diary`, `write_entry`, `notebooks`                    | `notes:read` / `notes:write`       | Entries, and the subjects they belong to |
| `ideas`, `add_idea`                                    | `notes:read` / `notes:write`       | Things caught before they evaporated     |
| `shopping_list`, `add_to_shopping_list`, `tick_bought` | `shopping:read` / `shopping:write` | To buy, and the cupboard                 |
| `recipes`, `add_recipe`                                | `kitchen:read` / `kitchen:write`   | The cookbook, ingredients included       |

## Making the token

Settings → Integrations → New token. There is a button on that form called
**An AI assistant (MCP)** which ticks exactly the scopes above — grant fewer if you
want it to read and not write, and the tools it was not granted are not offered
to it at all.

The token is shown once. It is revoked from the same page, and revoking it is
immediate.
