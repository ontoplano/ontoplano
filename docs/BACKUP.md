# Backups

Everything ontoplano knows is one SQLite file. This is how it survives the disk
it sits on.

Two mechanisms, doing different jobs:

- **Snapshots** (`make db-snapshot`) — a consistent copy taken with
  `VACUUM INTO`, kept beside the database, and taken automatically before every
  migration. Good for "the migration was wrong, put it back".
- **Replication** (Litestream) — the write-ahead log shipped to a replica as it
  is written, so the recovery point is seconds rather than the last snapshot.
  Good for "the machine is gone".

A `cp` of the database file is not a backup. With WAL enabled the `.db` file on
its own is missing whatever has not been checkpointed, which is how a copy
restores as an empty schema.

## Setting up replication

Litestream is a single binary:

```sh
curl -sL https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.tar.gz \
  | tar xz && sudo mv litestream /usr/local/bin/
```

Put the settings in `~/.config/ontoplano/env`, next to the ones the app already
reads:

```sh
ONTOPLANO_DB_PATH=/home/you/.local/share/ontoplano/ontoplano.db
ONTOPLANO_BACKUP_DIR=/home/you/.local/share/ontoplano/replica

# Offsite. Any S3-compatible bucket; leave the bucket unset to run local-only.
LITESTREAM_S3_BUCKET=ontoplano-backups
LITESTREAM_S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com
LITESTREAM_S3_REGION=eu-central-003
LITESTREAM_ACCESS_KEY_ID=…
LITESTREAM_SECRET_ACCESS_KEY=…
```

Then:

```sh
make backup-install   # writes ~/.config/litestream.yml, installs and starts the unit
make backup-status    # generations, and how far behind each replica is
```

The unit is separate from the app's: replication follows the file, not the
process, so it keeps running across restarts and deploys.

## Restoring — do this before you need it

```sh
scripts/restore-drill.sh              # from the local replica
REPLICA=s3 scripts/restore-drill.sh   # from the offsite one
```

It restores into a scratch directory, runs `integrity_check` and
`foreign_key_check`, prints a row count per table, and leaves the copy behind so
you can boot the app against it:

```sh
DATABASE_URL=/tmp/ontoplano-restore-XXXX/restored.db node build/index.js
```

The live database is never touched.

### The drill, performed

Run on 2026-08-25 against a database of synthetic data, to make sure this
procedure is real rather than plausible:

1. `VACUUM INTO` a copy, 15 settings / 45 weekly slots / 5 diary entries.
2. Started `litestream replicate` against it.
3. Inserted a sixth diary entry **while replication was running**.
4. Deleted the database, its `-wal` and its `-shm` — the disk "dies".
5. `scripts/restore-drill.sh`: `integrity_check` **ok**, foreign keys clean, and
   the counts came back 15 / 45 / **6** — including the row written after the
   last snapshot, which is the whole point of shipping the WAL.
6. Booted the app against the restored file: pages served, sessions from before
   the loss still valid, entries visible.

Redo it after any change to the replication config, and note the date here.

### And then put it on a timer

A drill performed once is a drill that proves the backups were restorable on
one afternoon in August. Whatever schedules the rest of your machine —
systemd, cron, a CI job — should run this weekly and tell you when it stops
passing, because the failure this catches is silent by nature: the backups go
on being written, and being written is not the same as being restorable.

Two things are worth checking beyond `integrity_check`, and neither is
obvious. **A database with the schema and no rows passes every structural
check there is** — count something you would expect to exist. And **a copy
that is behind the code's migrations restores perfectly and then refuses to
serve**, because the app checks its migration head at boot; compare
`__drizzle_migrations` against `drizzle/meta/_journal.json` before believing
a green light.

## What is not covered

- **The config file.** `~/.config/ontoplano/config.toml` and the env file are not
  in the replica. They are small; copy them somewhere yourself.
- **Uploads.** Pictures are blobs inside the database, so replication covers
  them — it is also why the file grows faster than the row counts suggest.
- **Alerting.** Silence is the default failure mode of every backup. `make
backup-status` shows replication lag; check it, or wire it into whatever
  already watches the machine.
