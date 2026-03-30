# semotina

A weekly routine dashboard for tracking daily activities across three domains: **duty**, **skill**, and **money**.

## Setup

```sh
yarn
yarn db:push
npx tsx src/lib/server/db/seed.ts
yarn dev
```

Config and data directories are created automatically on first run:

- Config: `~/.config/semotina/config.toml`
- Data: `~/.local/share/semotina/`

## Configuration

Edit `~/.config/semotina/config.toml`:

```toml
[server]
host = "0.0.0.0"
port = "1493"

[database]
# path = "/custom/path/to/semotina.db"

[week]
first_day = "0"
generate_day = "6"
```

Copy `.env.example` to `.env` and set `ORIGIN` and `BETTER_AUTH_SECRET`.

## Usage

1. Register at `/login`
2. Create activities at `/activities`
3. Plan your week at `/planner`
4. Track daily execution on `/`

### Keyboard shortcuts

| Page       | Keys                | Action                                     |
| ---------- | ------------------- | ------------------------------------------ |
| Dashboard  | `j`/`k`             | Navigate tasks                             |
| Dashboard  | `c` `d` `e` `s` `r` | Done, delayed, early, skip, reset          |
| Dashboard  | `t`                 | Edit scheduled time                        |
| Activities | `j`/`k`             | Navigate list                              |
| Activities | `n`                 | New activity                               |
| Planner    | `h`/`l`             | Switch day                                 |
| Planner    | `j`/`k`             | Navigate slots                             |
| Planner    | `e`                 | Edit selected slot                         |
| Planner    | `d`                 | Disable/enable selected slot               |
| Planner    | `D`                 | Delete selected slot                       |
| Planner    | `n`                 | New slot (focuses time input)              |
| Planner    | `[`/`]`             | Previous/next week (can't go past current) |
| Planner    | `v`                 | Toggle multiselect mode                    |
| Planner    | `Space`             | Toggle slot selection (multiselect)        |
| Planner    | `x`                 | Delete selected slots (multiselect)        |
| Planner    | `p`                 | Copy selected to weekdays (multiselect)    |
| History    | `h`/`l`             | Switch day                                 |
| History    | `j`/`k`             | Navigate tasks                             |
| History    | `[`/`]`             | Previous/next week                         |
| All        | `J`/`K`             | Navigate between pages                     |
| All        | `Esc`               | Close form                                 |

## Commands

```sh
yarn dev              # Dev server
yarn build            # Production build
yarn preview          # Preview build
yarn db:push          # Push schema
yarn db:generate      # Generate migrations
yarn db:migrate       # Apply migrations
yarn db:studio        # Drizzle Studio
yarn test:e2e         # Playwright tests
yarn lint             # Check formatting + linting
yarn format           # Auto-format
```

## Deployment

```sh
make build            # Docker image
make dev              # Docker dev
make install-service  # systemd user service
```

## Stack

SvelteKit · Svelte 5 · SQLite · Drizzle ORM · better-auth · Tailwind CSS v4 · adapter-node
