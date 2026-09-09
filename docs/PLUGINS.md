# Writing an ontoplano plugin

A plugin is **an external app that talks to ontoplano over HTTP**. It doesn't run inside
ontoplano, doesn't ship any code into it, and can't break it. There's nothing to install
and no plugin API version to track — you get an API token, and you're a plugin.

Plugins do two things:

- **Push data in** as a _stream_ — readings, events, counts. Ontoplano charts it for you.
- **Read the schedule out** — to act on what the user has planned.

A smart-scale alarm app does both, and is the example used throughout: it pushes weight
readings, and reads upcoming planner slots to decide when to ring.

---

## 1. Get a token

The user creates one at **Settings → AI & Integrations → Integrations**, choosing scopes. The full
list of scopes and what each grants is generated from the code in
[`docs/reference/ways-in.md`](reference/ways-in.md) — a table here would only
drift from it. Ask for the narrowest set that works. A token with only `streams:write` cannot read
anything the user has — which is the point, because tokens live on phones.

The plaintext token (`onto_…`) is shown **once**. Store it in the OS keychain, not a
config file in a repo.

```
Authorization: Bearer onto_xxxxxxxxxxxxxxxx
Content-Type: application/json
```

Verify your setup and discover the user's timezone:

```http
GET /api/v1/me
→ { "user_id": "...", "scopes": ["streams:write"], "timezone": "America/Sao_Paulo" }
```

---

## 2. Push data

### Declare the stream

Idempotent — call it at every startup, it costs nothing.

```http
POST /api/v1/streams
{
  "slug":    "scale.weight",
  "name":    "Weight",
  "source":  "scale",
  "kind":    "measurement",
  "unit":    "kg",
  "display": "line_chart"
}
```

Namespace your slug with your app name (`yourapp.thing`). Lowercase, dots and dashes.

| `kind`        | Meaning                                          | `value`          |
| ------------- | ------------------------------------------------ | ---------------- |
| `measurement` | a quantity over time (weight, mood, hours slept) | required, number |
| `counter`     | a count of something                             | required, number |
| `event`       | something happened                               | optional         |
| `state`       | current status                                   | optional         |

`display` picks the built-in renderer: `line_chart`, `calendar_heatmap`, `latest_value`,
`bar_chart`, `list`. The user can change it later; don't fight them for it.

`retention_days` (optional, 1–3650) asks the server to keep only that many days of
points: older ones are deleted, nightly and on push. Omit it to leave the setting
alone — the user can set it in the app, and a redeclare at startup must not wipe
their choice. Send `null` explicitly to mean "keep everything". A high-frequency
stream should set this; nobody wants minute-by-minute readings from two years ago.

### Push points

```http
POST /api/v1/streams/scale.weight/points
{
  "points": [
    { "external_id": "2026-08-09T07:12:03Z", "at": "2026-08-09T07:12:03Z", "value": 78.4 },
    { "external_id": "2026-08-08T07:05:41Z", "at": "2026-08-08T07:05:41Z", "value": 78.9,
      "meta": { "device": "scale-01" } }
  ]
}

→ 200 { "accepted": 2, "duplicates": 0, "rejected": [] }
```

Up to 500 points per request.

Budgets, so one producer cannot crowd out the rest: each token gets 240 reads and 60
writes a minute, and the account as a whole gets 600 and 150 across all its tokens —
more keys are not more budget. A 429 carries `Retry-After`; honour it. Stored points
are also counted against the plan's storage ceiling, and a batch that would cross it
is refused whole with a `plan_limit` error — set `retention_days` and the problem
never comes up.

### The one rule that matters: `external_id`

**It must be a pure function of the reading** — its capture timestamp, or a hash of its
content. Same reading → same id, forever, across reinstalls and devices.

Never generate it randomly at send time. The first time a request succeeds server-side but
the response is lost, your retry will duplicate the point and quietly corrupt the user's
chart. With a derived id, the retry is reported as a `duplicate` and nothing happens.

`duplicates` is **success**, not an error. Mark the reading as synced.

If you omit `external_id`, the instant is used — which keeps the guarantee for simple
producers rather than silently degrading.

### Partial success

One malformed point doesn't fail the batch:

```json
{
	"accepted": 6,
	"duplicates": 1,
	"rejected": [{ "external_id": "abc", "reason": "value is required for 'measurement' streams" }]
}
```

Rejected points will _never_ succeed — log and drop them. Don't retry them forever.

**The worked example lives in `examples/onto-readings.mjs`**: a CSV of
measurements becomes one stream per column. Every bathroom scale, sleep
tracker and blood-pressure cuff has an app that exports one, and this is the
shortest path from that file to a chart you own — about 200 lines, no
dependencies, and everything above in one place: declaring a stream at
startup, batching, `external_id` so re-running the same file adds nothing, and
naming what was rejected rather than counting it.

It reads a file rather than talking to Withings or Garmin, deliberately. The
moment a plugin holds somebody else's credentials, the interesting question
stops being what it does and becomes who else can read your weight.

---

## 3. Read the schedule

```http
GET /api/v1/schedule/upcoming?days=7
→ {
    "timezone": "America/Sao_Paulo",
    "from": "2026-08-09T00:00:00",
    "to":   "2026-08-16T00:00:00",
    "occurrences": [
      {
        "id": "slot:1423",
        "source": "slot",
        "at_local": "2026-08-11T07:00:00",
        "local_date": "2026-08-11",
        "start_time": "07:00",
        "duration_minutes": 30,
        "title": "Wake up",
        "category": "duty",
        "label": "",
        "status": "pending"
      }
    ]
  }
```

Only pending occurrences by default; pass `include_completed=true` for all.

**`at_local` is naive local wall-clock time** — no offset — and `timezone` tells you how to
interpret it. That is deliberate: a consumer setting an alarm wants the wall-clock
time in the account's own zone, not an instant it has to convert back.

### Deciding what to do with an occurrence is _your_ job

Ontoplano reports what's scheduled. It knows nothing about alarms, ringtones, or wifi —
and it shouldn't, or every consumer's concepts would leak into its schema.

So matching rules live in **your** app's config. The alarm app above stores something like:

```
hard_alarm_when: title matches /wake up/i
soft_alarm_when: category == "duty"
```

and resolves each occurrence against that at sync time. If you find yourself wanting
ontoplano to store a field that only your app understands, that's the signal to keep it on
your side instead.

---

## 3½. Webhooks: hearing about things

Streams push data in; webhooks let your program hear about things happening, without
running any code inside ontoplano. Subscribe an address (scope `webhooks:manage`, or on
the integrations page), and matching events are POSTed to it:

```http
POST /api/v1/webhooks
{ "url": "https://example.com/hook", "events": ["shopping.added", "shopping.bought"] }

→ 201 { "id": 3, "secret": "whsec_…", "events": [...], ... }
```

Events: `todo.created` `todo.completed` `idea.created` `diary.created` `shopping.added`
`shopping.bought`. A delivery looks like:

```http
POST <your url>
X-Ontoplano-Event: shopping.added
X-Ontoplano-Signature: sha256=<hmac>
{ "event": "shopping.added", "at": "2026-08-29T12:00:00Z", "data": { "id": 12, "name": "Milk" } }
```

Verify the signature: HMAC-SHA256 of the raw body with your subscription's `secret`,
hex, prefixed `sha256=`. Payloads are deliberately thin — the id, and the one-line label
where the thing _is_ its label (a todo's title, an item's name, an idea). A diary entry
announces only its id; content never leaves the app.

Delivery is best-effort and says so: one attempt, five seconds, no queue, at-most-once.
Answer with a 2xx quickly and do your work afterwards. An address that fails ten times
in a row is given up on — the row says so, and "Try again" (or resubscribing) re-arms
it. `GET /api/v1/webhooks` lists yours; `DELETE /api/v1/webhooks/<id>` unsubscribes.

On a hosted instance the address must be reachable from the internet — private and
loopback addresses are refused. Self-hosted instances may point anywhere.

### The shopping list

```http
GET  /api/v1/shopping                          → { "items": [...] }        (shopping:read)
POST /api/v1/shopping/items                    { "name": "Milk", "category": "Dairy" }
POST /api/v1/shopping/items/<id>/bought        { "bought": true }
```

Adding a held name puts it back on the list instead of duplicating (the
response says `already_had`); `category` is a name, created if new; `bought`
is a state, not a toggle — saying it twice is safe. Shopping webhook events
fire only on transitions, so a mirror that echoes changes back settles
instead of looping.

**The worked example lives in `examples/onto-household.mjs`**: one script,
two tokens, and a household shares a shopping list — across two different
instances if that is where the two people live. It is ~150 lines and uses
nothing above: scoped tokens, the shopping API, self-managed webhooks.

---

## 4. Errors

```json
{ "error": { "code": "not_found", "message": "Stream not found" } }
```

| Status | Code               | What to do                                                                            |
| ------ | ------------------ | ------------------------------------------------------------------------------------- |
| 401    | `unauthorized`     | token bad/revoked/expired — stop, prompt the user to reconnect                        |
| 403    | `forbidden`        | token lacks the scope — stop, don't retry                                             |
| 404    | `not_found`        | stream missing (or not yours) — re-declare once, then retry                           |
| 409    | `conflict`         | duplicate resource                                                                    |
| 422    | `validation_error` | malformed — **don't retry**, it will never succeed                                    |
| 402    | `plan_limit`       | a storage ceiling — surface the message, don't retry. A self-hosted instance has none |

A resource belonging to another user returns exactly what a nonexistent one returns. Don't
read anything into a 404 beyond "not available to you".

Retry 5xx with exponential backoff and jitter; keep the queue durable across restarts.

---

## 5. Checklist for a well-behaved plugin

- [ ] `external_id` derived from the reading, never random
- [ ] Treats `duplicates` as success
- [ ] Drops 422s instead of retrying them
- [ ] Durable queue — survives restart, drains when connectivity returns
- [ ] Backs off on 5xx/429, honours `Retry-After`
- [ ] Token in the OS keychain, never in the repo, never logged
- [ ] Narrowest scopes that work
- [ ] Base URL configurable (self-hosters exist)
- [ ] Works standalone with sync disabled — ontoplano is never a hard dependency
- [ ] Surfaces sync status: last success, pending count, last error
- [ ] Re-declares its stream at startup

---

## 6. What plugins deliberately cannot do

No custom UI, no injected JavaScript, no server-side code, no layout control, no access to
other users' data.

This is a deliberate ceiling, not an oversight. It's what keeps the platform at "an HTTP
endpoint and five renderers" instead of a sandbox, a permission model, a compatibility
contract, and a support burden for everyone else's bugs. If you need a bespoke
visualisation, build it in your own app and push a _summary_ stream here.

If you're self-hosting and genuinely need to run code inside ontoplano, you have the
source — but that's a fork, not a plugin, and you own the merge conflicts.

---

## 7. Local testing

```sh
TOKEN=onto_xxx
BASE=http://localhost:1493

curl -s -X POST $BASE/api/v1/streams \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"slug":"demo.temperature","name":"Temperature","source":"demo","kind":"measurement","unit":"°C","display":"line_chart"}'

curl -s -X POST $BASE/api/v1/streams/demo.temperature/points \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"points":[{"external_id":"t1","at":"2026-08-09T10:00:00Z","value":21.5}]}'

# Run it twice — the second returns duplicates: 1, accepted: 0
curl -s "$BASE/api/v1/schedule/upcoming?days=7" -H "Authorization: Bearer $TOKEN"
```

Then open `/data/demo.temperature`.

## Declaring what your plugin understands

Slot metadata accepts any key, which is what lets a plugin invent its own
vocabulary without a change to ontoplano. The cost is that the keys arrive
anonymous: `hard_alarm` sitting next to `location` with nothing saying which
program reads it or what it does.

So declare a manifest at startup. It is idempotent per `source`, and the newest
call wins — a plugin that stops using a key drops it by omitting it.

```http
PUT /api/v1/plugin
Authorization: Bearer <token with plugin:declare>
Content-Type: application/json

{
  "source": "scale",
  "name": "Smart scale",
  "description": "Smart-scale alarm",
  "homepage": "https://example.com/scale",
  "metaKeys": [
    { "key": "alarm",       "description": "Ring an alarm for this block",       "example": "true" },
    { "key": "remind_min",  "description": "Notify N minutes beforehand",        "example": "5" },
    { "key": "hard_alarm",  "description": "Alarm that resists being dismissed", "example": "true" }
  ]
}
```

The metadata editor then offers those keys labelled with your plugin's name
instead of as a bare list. Declared keys must be valid metadata keys —
lowercase letters, digits and underscores — because a manifest describing keys
the server would reject on save is worse than no manifest.

Manifests are per-account, not global: they are a claim by one installation, and
two people may be running different versions.

Withdrawing one (`DELETE /api/v1/plugin?source=…`) removes the labels. It does
not remove the metadata — those keys keep working, they just stop saying who
reads them.
