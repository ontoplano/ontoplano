# ontoplano

A weekly routine dashboard for tracking daily activities across three domains: **duty**, **skill**, and **money**. Also tracks habits, diary entries, and beliefs (memory reconsolidation).

## Setup

```sh
yarn
yarn db:push
npx tsx src/lib/server/db/seed.ts
yarn dev
```

Config and data directories are created automatically on first run:

- Config: `~/.config/ontoplano/config.toml`
- Data: `~/.local/share/ontoplano/`

## Configuration

Edit `~/.config/ontoplano/config.toml`:

```toml
[server]
host = "0.0.0.0"
port = "1493"

[database]
# path = "/custom/path/to/ontoplano.db"

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
5. Journal at `/diary`
6. Track habits at `/habits`
7. Work on beliefs at `/beliefs`

### Keyboard shortcuts

| Page       | Keys                | Action                                     |
| ---------- | ------------------- | ------------------------------------------ |
| Dashboard  | `j`/`k`             | Navigate tasks                             |
| Dashboard  | `c` `d` `e` `s` `r` | Done, delayed, early, skip, reset          |
| Dashboard  | `t`                 | Edit scheduled time                        |
| Dashboard  | `D`                 | Edit duration override                     |
| Dashboard  | `x`                 | Delete task instance                       |
| Activities | `j`/`k`             | Navigate list                              |
| Activities | `n`                 | New activity                               |
| Activities | `1` `2` `3`         | Toggle filter duty/skill/money             |
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
| Diary      | `j`/`k`             | Navigate entries                           |
| Diary      | `n`                 | New entry                                  |
| Diary      | `e`                 | Edit entry                                 |
| Habits     | `j`/`k`             | Navigate habits                            |
| Habits     | `n`                 | New habit                                  |
| Habits     | `Enter`             | Expand/collapse                            |
| Beliefs    | `j`/`k`             | Navigate beliefs                           |
| Beliefs    | `n`                 | New belief                                 |
| Beliefs    | `Enter`             | Expand/collapse                            |
| Beliefs    | `e`                 | Edit belief                                |
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

### systemd user service

1. Create the production env file at `~/.config/ontoplano/env`:

```sh
# App origin URL
# LAN:      http://<your-lan-ip>:1493
# External: https://ontoplano.example.com
ORIGIN=http://192.168.1.50:1493

# Better Auth secret — generate with: openssl rand -hex 16
BETTER_AUTH_SECRET=your-secret-here
```

2. Install and start the service:

```sh
make install-service
```

To switch from LAN to an external domain later, edit `~/.config/ontoplano/env`, set `ORIGIN=https://ontoplano.yourdomain.com`, then restart:

```sh
systemctl --user restart ontoplano
```

### Docker

```sh
make build            # Docker image
make dev              # Docker dev
```

## Colors

All UI colors are centralized in `src/lib/colors.ts`. Edit that file to change colors across all routes — navbar, beliefs graph (valence, relations, islands), habits heatmap, category fallbacks, and dashboard section accents.

## Stack

SvelteKit · Svelte 5 · SQLite · Drizzle ORM · better-auth · Tailwind CSS v4 · adapter-node
