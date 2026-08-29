# The Telegram bot

A bot that answers with your plan, your shopping list and your todos, and takes
a diary entry or an idea by message.

## It is for a self-hosted instance, and only for one

The bot opens the database file directly and acts as the account that owns the
instance. That is fine on your own machine and unacceptable anywhere else: on a
shared instance one Telegram account would hold the keys to everybody's data.

So it refuses to start unless the deployment says it is self-hosted — the same
gate as deployment settings in the UI, and where billing will sit. A hosted
ontoplano simply does not run it.

```sh
# ~/.config/ontoplano/env
ONTOPLANO_SELF_HOST=true
ONTOPLANO_TELEGRAM_BOT_TOKEN=…      # from @BotFather
ONTOPLANO_TELEGRAM_ALLOWED_USER=123456789  # your numeric Telegram id; the bot ignores everyone else
```

Ask [@userinfobot](https://t.me/userinfobot) for your id.

```sh
make telegram-install          # dependencies
make install-telegram-service  # systemd unit, enabled and started
make telegram-logs             # follow it
```

## Commands

| Command       | What it does                                     |
| ------------- | ------------------------------------------------ |
| `/plan`       | Today's schedule, with what is done              |
| `/grid`       | The week, grouped by day                         |
| `/activities` | Activities by category                           |
| `/todo`       | List todos, or add one: `/todo call the dentist` |
| `/list`       | The shopping inventory by category               |
| `/missing`    | What is left to buy                              |
| `/wishlist`   | Wishlist items                                   |
| `/diary`      | Save an entry: `/diary today went like this`     |
| `/ideia`      | Save an idea: `/ideia meal plan → list`          |
| `/help`       | This list                                        |

`telegram/COMMANDS.md` is the plain list to paste into BotFather's
`/setcommands`.

## If it ever grows

It reads the database rather than calling `/api/v1` with a scoped token, which
is what every other plugin does and what makes them safe to run anywhere. That
is the change to make if this stops being one person's convenience — see
`docs/PLUGINS.md`.
