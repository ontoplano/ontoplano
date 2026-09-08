# The sound a reminder makes

`reminder.mp3` in this directory is the ringtone the app comes with — the one
every account gets until somebody uploads their own. It is served straight from
`/sounds/reminder.mp3`, so replacing the file is the whole of changing it.

Keep it small (it is fetched by every browser that hears a reminder) and keep it
short: this plays when something is due, not while somebody listens to it.
Under 100 KB and under three seconds is the shape.

Uploads go in the database instead — ten per account, 300 KB each, in the
`ringtones` table. See `src/lib/server/services/ringtones.ts`.
