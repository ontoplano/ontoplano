package app.ontoplano.isolated;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/**
 * The phone rings for an instance that cannot wake it.
 *
 * A web page cannot do this job. Android's web view has no Push API, so a
 * server has no way to reach the app; and the shell's plugins reach the copy
 * of ontoplano it carries and no further, so a page served by that server
 * cannot book an alarm either. Between the two, a reminder made on a server
 * arrived only while the app happened to be open.
 *
 * So the phone asks instead. It holds an address and a key — the same pair the
 * home-screen widgets hold — reads what is about to go off, and books Android's
 * own alarms with the answer. That works with the app shut, needs no Google
 * services, and is the same for the instance somebody hosts themselves as for
 * any other.
 *
 * Booked from scratch every time rather than diffed. A reminder that was moved,
 * dismissed or deleted has to stop ringing, and working out which pending alarm
 * belongs to a row that no longer exists is bookkeeping with no upside.
 */
final class Ringer {
    private static final String TAG = "OntoplanoRinger";

    /** Its own file: the widgets' pair is theirs, and revoking one is not the other. */
    private static final String FILE = "ontoplano_ringer";
    private static final String KEY_ORIGIN = "origin";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_BOOKED = "booked";
    /*
     * What happened last time, so a person can be told rather than reassured.
     *
     * "Reminders arrive on this phone" is a promise, and until these existed
     * the app had no way to say whether it was keeping it: everything here
     * happens with no page open and nobody to report to. See `status`.
     */
    private static final String KEY_LAST_LOOK = "lastLook";
    private static final String KEY_LAST_OK = "lastOk";
    private static final String KEY_LAST_TROUBLE = "lastTrouble";
    private static final String KEY_NEXT_LOOK = "nextLook";
    private static final String KEY_NEXT_RING = "nextRing";

    /** The channel Android files these under, so a person can silence them alone. */
    static final String CHANNEL = "ontoplano-reminders-audible";

    /**
     * What this app called the channel before, deleted rather than left.
     *
     * A channel's importance is fixed when it is made — Android ignores every
     * field passed after the first time, on purpose, because from then on the
     * sound is the person's setting and not the app's. Phones that made the
     * first one before its importance was set right have been posting
     * reminders silently ever since, and no amount of creating it again
     * raises it. A new id is the only way to reach them; the old row is
     * removed so nobody keeps a dead Reminders entry in their settings.
     *
     * `src/lib/phone-notifications.ts` holds the same two strings.
     */
    private static final String[] RETIRED_CHANNELS = {"ontoplano-reminders"};

    private static final int TIMEOUT_MS = 10000;

    /**
     * How often it asks again.
     *
     * The answer covers weeks, so this is not about staying current — it is
     * about a reminder made on a laptop this afternoon ringing tonight without
     * the app being opened in between. Inexact on purpose: the refresh does not
     * need to be punctual, only regular. The alarms it *books* are exact.
     *
     * It was six hours, which is how long a reminder made anywhere else could
     * stay invisible to this phone — and how long one that was deleted
     * elsewhere could keep a ring booked.
     *
     * Fifteen minutes, because of what the window actually costs. A reminder
     * made *on this phone* is booked the moment it is saved, and one made
     * anywhere else but due further out than this is found and then rings to
     * the minute. The only thing this number bounds is the one case that can
     * still fail: made on another device, due within the window, and the app
     * not opened in between. Six hours made that case ordinary; fifteen
     * minutes makes it rare.
     *
     * The alternative was a push channel, and every one of them costs somebody
     * something: Firebase costs the build its independence — no Play services
     * is what lets F-Droid ship this — and UnifiedPush costs the person a
     * second app to install before their reminders work properly. Neither is a
     * fair price for closing a window this small. Polling asks nothing of
     * anybody.
     *
     * Fifteen is also the platform's own idea of a reasonable cadence: it is
     * the floor `JobScheduler` allows a periodic job. One small request, and
     * the radio is awake for a few seconds — about what a mail client on a
     * fifteen-minute sync costs, and this one sends far less.
     */
    private static final long REFRESH_MS = 15 * 60 * 1000L;

    /**
     * And a last look, shortly before the next thing is due to ring.
     *
     * The standing cadence bounds how stale the list can be; this bounds it
     * where it actually costs something. A reminder moved or deleted on a
     * laptop at ten to nine should not ring at nine, and one *made* at ten to
     * nine for nine o'clock is the case the whole feature exists for. Five
     * minutes is long enough for a request on a bad connection and short
     * enough that little changes inside it.
     */
    private static final long VERIFY_BEFORE_MS = 5 * 60 * 1000L;

    /**
     * How soon to try again when the instance could not be reached.
     *
     * A failed refresh used to wait out the whole cadence, so a phone that was
     * in a lift at the wrong moment went a full interval on a stale list. This
     * is short because the common failure is momentary.
     */
    private static final long RETRY_MS = 10 * 60 * 1000L;

    /**
     * How far each phone pulls its own next look earlier, at random.
     *
     * Phones do not poll at random times; they poll at whatever time they last
     * polled, plus an interval. Anything that starts a lot of them together
     * keeps them together — everyone installing the same update, a power cut
     * that reboots a building, and worst of all an instance that was down and
     * comes back, because every phone that failed while it was down is now
     * counting from the same instant. They then arrive in a clump, every
     * interval, forever; and the clump after an outage lands exactly when the
     * server has the least to spare.
     *
     * So each look is pulled earlier by a random slice of this. Subtracted
     * rather than added in both directions, so the interval it promises is
     * still a ceiling — never later than the cadence says, only sooner.
     *
     * It matters most on the retry, which is the one place phones are
     * genuinely synchronised by a shared cause. A five-minute spread over a
     * ten-minute retry turns a stampede into a queue.
     */
    private static final long SPREAD_MS = 5 * 60 * 1000L;

    /** A slice of `SPREAD_MS`, this phone's own. */
    private static long spread() {
        return (long) (Math.random() * SPREAD_MS);
    }

    /**
     * Ids for the alarms this books.
     *
     * A reminder's own id, offset into a range of its own, so nothing here can
     * collide with the notifications the web side books for the instance the
     * app carries — those are the row ids as they stand.
     */
    private static final int RING_BASE = 1_000_000;
    /** And one id that is not a reminder: the alarm that asks for the next list. */
    private static final int REFRESH_ID = 999_999;
    /** And one for "show me this alarm", which the status bar's icon opens. */
    private static final int SHOW_ID = 999_998;

    private Ringer() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static boolean configured(Context context) {
        return !prefs(context).getString(KEY_ORIGIN, "").isEmpty()
                && !prefs(context).getString(KEY_TOKEN, "").isEmpty();
    }

    /**
     * Remember which instance this phone rings for, and start ringing for it.
     *
     * Replacing one instance with another cancels what the old one booked: the
     * alarms are that instance's, and a key minted by one means nothing to the
     * next.
     */
    static void remember(Context context, String origin, String token) {
        cancelBooked(context);
        prefs(context)
                .edit()
                .putString(KEY_ORIGIN, tidy(origin))
                .putString(KEY_TOKEN, token)
                .apply();
        scheduleRefresh(context);
    }

    /** Stop. Everything booked goes with it, because nothing will renew it. */
    static void forget(Context context) {
        cancelBooked(context);
        cancelRefresh(context);
        prefs(context).edit().remove(KEY_ORIGIN).remove(KEY_TOKEN).apply();
    }

    static String origin(Context context) {
        return prefs(context).getString(KEY_ORIGIN, "");
    }

    /** Trailing slashes are how `https://host//api/v1/...` happens. */
    private static String tidy(String origin) {
        String clean = origin == null ? "" : origin.trim();
        while (clean.endsWith("/")) {
            clean = clean.substring(0, clean.length() - 1);
        }
        return clean;
    }

    /**
     * Ask the instance what is coming, and book it — on a thread of its own.
     *
     * Every caller is somewhere that must not wait: an app starting, a
     * broadcast receiver with ten seconds to live. Nothing here reports
     * failure upwards, because there is nobody to report it to at the moment it
     * happens; what a failure costs is the next refresh doing the job.
     */
    static void sync(final Context context) {
        final Context app = context.getApplicationContext();
        new Thread(
                        new Runnable() {
                            @Override
                            public void run() {
                                syncNow(app);
                            }
                        })
                .start();
    }

    static void syncNow(Context context) {
        if (!configured(context)) return;

        List<Reminder> coming = fetch(context);
        if (coming == null) {
            // Unreachable, refused, or nonsense: leave what is booked alone.
            // The alarms already on the phone are the last good answer, and
            // throwing them away because the wifi is down is how a morning is
            // missed. Try again soon rather than at the next standing look —
            // the usual reason for this is a tunnel.
            prefs(context)
                    .edit()
                    .putLong(KEY_LAST_LOOK, System.currentTimeMillis())
                    .putBoolean(KEY_LAST_OK, false)
                    .putString(KEY_LAST_TROUBLE, "unreachable")
                    .apply();
            scheduleRetry(context);
            return;
        }

        cancelBooked(context);
        ensureChannel(context);

        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        List<String> booked = new ArrayList<>();
        long now = System.currentTimeMillis();
        /** The earliest thing this books, which the next look aims just before. */
        long soonest = 0L;

        for (Reminder one : coming) {
            if (one.at <= now) continue;

            Intent ringing = new Intent(context, RingerReceiver.class)
                    .setAction(RingerReceiver.ACTION_RING)
                    .putExtra(RingerReceiver.EXTRA_MESSAGE, one.message)
                    .putExtra(RingerReceiver.EXTRA_AUDIBLE, one.audible)
                    // A data URI nothing reads, so that two PendingIntents for
                    // two reminders are not "the same intent" by Android's
                    // reckoning — extras do not distinguish them.
                    .setData(android.net.Uri.parse("ontoplano://reminder/" + one.id));

            PendingIntent pending = PendingIntent.getBroadcast(
                    context,
                    RING_BASE + one.id,
                    ringing,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            exactly(context, alarms, one.at, pending);
            booked.add(String.valueOf(one.id));
            if (soonest == 0L || one.at < soonest) soonest = one.at;
        }

        prefs(context)
                .edit()
                .putString(KEY_BOOKED, join(booked))
                .putLong(KEY_LAST_LOOK, now)
                .putBoolean(KEY_LAST_OK, true)
                .putString(KEY_LAST_TROUBLE, "")
                .putLong(KEY_NEXT_RING, soonest)
                .apply();
        scheduleRefresh(context, soonest);
    }

    /**
     * At the minute, not near it.
     *
     * Three rungs, and the app comes down them only when the phone refuses the
     * one above.
     *
     * **`setAlarmClock` is the top one** and it is what a reminder actually is.
     * Android treats it as a user-visible alarm: it survives Doze, it is not
     * batched with anything, and the system shows the alarm icon in the status
     * bar — which is also an honest thing for a person to be able to see. It
     * needs the same permission the exact call does.
     *
     * **`setExactAndAllowWhileIdle`** is the fallback for a phone where the
     * person has revoked that permission on Android 12.
     *
     * **`setAndAllowWhileIdle`** is the floor: late rather than silent. It used
     * to be the *only* rung anybody reached, because the manifest asked for no
     * permission at all — so every reminder this app has set on a modern phone
     * has been deferred by Doze, minutes at a time. The manifest asks now.
     *
     * The `PendingIntent` handed to `setAlarmClock` as its second argument is
     * what the system opens if somebody taps the alarm icon; the app's own
     * launcher intent is the honest answer to "show me this alarm".
     */
    private static void exactly(
            Context context, AlarmManager alarms, long at, PendingIntent pending) {
        if (alarms == null) return;

        try {
            alarms.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showAlarms(context)), pending);
            return;
        } catch (SecurityException refused) {
            // Android 12 with the permission revoked. Down a rung.
        }

        try {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        } catch (SecurityException refused) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pending);
        }
    }

    /**
     * Everything this phone knows about whether it will ring — as plain values.
     *
     * A reminder that does not arrive is the worst failure this app has, and
     * until now it failed *silently*: the alarms are booked with no page open,
     * by a receiver with ten seconds to live and nobody to report to. A person
     * whose reminder did not go off had no way to find out which link in the
     * chain was broken, and neither had I.
     *
     * So every link says where it stands:
     *
     *  - **ringingFor** — whether this phone has an instance and a key at all.
     *  - **lastLookAt / lastLookWorked / trouble** — whether the last attempt to
     *    ask that instance succeeded, and when.
     *  - **booked / nextRingAt** — how many alarms are on the phone right now,
     *    and when the first of them is due. Zero with reminders in the app is
     *    the interesting case.
     *  - **nextLookAt** — when it will ask again, which bounds how stale the
     *    list above can be.
     *  - **exactAllowed** — whether Android lets this book an alarm at a
     *    minute. Without it, everything is late by however long Doze feels
     *    like, and nothing else here would look wrong.
     *  - **channelAudible** — whether the channel the rings are posted to still
     *    makes a sound. Somebody can silence it from the system's own settings
     *    and the app has no say; it can only say so.
     *
     * Read by the page in Settings. It is not a debug screen: it is the answer
     * to "will this wake me tomorrow", which is a fair thing to ask an alarm.
     */
    static JSONObject status(Context context) {
        SharedPreferences held = prefs(context);
        JSONObject out = new JSONObject();
        try {
            out.put("ringingFor", held.getString(KEY_ORIGIN, ""));
            out.put("lastLookAt", held.getLong(KEY_LAST_LOOK, 0L));
            out.put("lastLookWorked", held.getBoolean(KEY_LAST_OK, false));
            out.put("trouble", held.getString(KEY_LAST_TROUBLE, ""));
            out.put("nextLookAt", held.getLong(KEY_NEXT_LOOK, 0L));
            out.put("nextRingAt", held.getLong(KEY_NEXT_RING, 0L));
            out.put("booked", countBooked(held.getString(KEY_BOOKED, "")));
            out.put("exactAllowed", exactAllowed(context));
            out.put("channelAudible", channelAudible(context));
        } catch (JSONException broken) {
            Log.w(TAG, "could not describe the ringer", broken);
        }
        return out;
    }

    private static int countBooked(String kept) {
        if (kept.isEmpty()) return 0;
        int n = 0;
        for (String id : kept.split(",")) {
            if (!id.isEmpty()) n++;
        }
        return n;
    }

    /**
     * Whether Android will let this book an alarm at a minute rather than near one.
     *
     * Below Android 12 there is no such permission and the answer is yes. From
     * 12 it can be revoked, and from 13 the app holds USE_EXACT_ALARM, which
     * cannot be — but asking is still the honest way to find out, because what
     * matters is what this phone will actually allow.
     */
    private static boolean exactAllowed(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarms != null && alarms.canScheduleExactAlarms();
    }

    /** Whether the channel the rings go to still makes a noise. */
    private static boolean channelAudible(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return false;
        NotificationChannel channel = manager.getNotificationChannel(CHANNEL);
        // No channel yet is not "silenced" — it is "nothing has been booked on
        // this phone yet", and the first sync makes it.
        if (channel == null) return true;
        return channel.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT;
    }

    /** Where the status bar's alarm icon leads: the app, at the reminders. */
    private static PendingIntent showAlarms(Context context) {
        Intent open = context
                .getPackageManager()
                .getLaunchIntentForPackage(context.getPackageName());
        if (open == null) open = new Intent(Intent.ACTION_MAIN);
        return PendingIntent.getActivity(
                context, SHOW_ID, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Book the next look, and make sure Doze cannot swallow it.
     *
     * This was `set(RTC, …)`, and both halves of that were wrong on a phone
     * that is doing what phones do. `RTC` does not wake the device, so the
     * refresh waited for something else to wake it; and a plain `set` is
     * exactly what Doze is allowed to defer, indefinitely, while the screen is
     * off. So the one alarm whose whole job is to *discover* reminders made
     * elsewhere was the one alarm the system could starve — overnight, which
     * is when tomorrow's reminders get made.
     *
     * `setAndAllowWhileIdle` is the weakest call that Doze honours. It is
     * throttled to about one firing every nine minutes per app while idle,
     * which is far below anything asked for here, and it stays inexact: this
     * wants to be regular, not punctual.
     *
     * `soonest` is the next thing already booked, or 0. The refresh lands at
     * whichever comes first — the standing hour, or a last look just before
     * that ring.
     */
    private static void scheduleRefresh(Context context, long soonest) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;

        long now = System.currentTimeMillis();
        // Earlier by this phone's own slice, so a thousand of them do not all
        // ask at the same second. See `SPREAD_MS`.
        long at = now + REFRESH_MS - spread();

        long verify = soonest - VERIFY_BEFORE_MS;
        // Only if that check is still ahead of us, and sooner than the standing
        // one: a ring due in two minutes has nothing useful to re-check.
        if (soonest > 0 && verify > now && verify < at) at = verify;

        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, refreshIntent(context));
        prefs(context).edit().putLong(KEY_NEXT_LOOK, at).apply();
    }

    /** The standing cadence, when there is nothing booked to aim at. */
    private static void scheduleRefresh(Context context) {
        scheduleRefresh(context, 0L);
    }

    /** Sooner than that, because the last attempt did not reach the instance. */
    private static void scheduleRetry(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;

        // The one place phones are genuinely in step: they all failed because
        // the same instance was down, so they are all counting from the moment
        // it went away. Spreading them is what stops the recovery being a
        // second outage.
        long at = System.currentTimeMillis() + RETRY_MS - spread();
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, refreshIntent(context));
        prefs(context).edit().putLong(KEY_NEXT_LOOK, at).apply();
    }

    private static void cancelRefresh(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(refreshIntent(context));
    }

    private static PendingIntent refreshIntent(Context context) {
        return PendingIntent.getBroadcast(
                context,
                REFRESH_ID,
                new Intent(context, RingerReceiver.class).setAction(RingerReceiver.ACTION_REFRESH),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Everything this booked last time, so nothing rings for a deleted row. */
    private static void cancelBooked(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        String kept = prefs(context).getString(KEY_BOOKED, "");
        if (alarms == null || kept.isEmpty()) return;

        for (String id : kept.split(",")) {
            if (id.isEmpty()) continue;
            try {
                Intent ringing = new Intent(context, RingerReceiver.class)
                        .setAction(RingerReceiver.ACTION_RING)
                        .setData(android.net.Uri.parse("ontoplano://reminder/" + id));
                alarms.cancel(
                        PendingIntent.getBroadcast(
                                context,
                                RING_BASE + Integer.parseInt(id),
                                ringing,
                                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            } catch (NumberFormatException skip) {
                // A file written by a version that wrote something else.
            }
        }
        prefs(context).edit().remove(KEY_BOOKED).apply();
    }

    /**
     * A channel of their own, so reminders can be silenced without silencing
     * the app. Made before the first notification, because a notification on a
     * channel that does not exist is one Android drops without a word.
     */
    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        for (String retired : RETIRED_CHANNELS) {
            if (manager.getNotificationChannel(retired) != null) {
                manager.deleteNotificationChannel(retired);
            }
        }

        if (manager.getNotificationChannel(CHANNEL) != null) return;

        NotificationChannel channel =
                new NotificationChannel(
                        CHANNEL,
                        context.getString(R.string.reminders_channel),
                        NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(context.getString(R.string.reminders_channel_what));
        manager.createNotificationChannel(channel);
    }

    // ── Reading the instance ─────────────────────────────────────────────────

    static final class Reminder {
        final int id;
        final long at;
        final String message;
        final boolean audible;

        Reminder(int id, long at, String message, boolean audible) {
            this.id = id;
            this.at = at;
            this.message = message;
            this.audible = audible;
        }
    }

    /** The list, or null for "could not ask" — which is not the same as "none". */
    private static List<Reminder> fetch(Context context) {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(origin(context) + "/api/v1/reminders/upcoming");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty(
                    "Authorization", "Bearer " + prefs(context).getString(KEY_TOKEN, ""));
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);

            int status = connection.getResponseCode();
            if (status == 401 || status == 403) {
                // The key is no longer good — revoked, or the instance changed
                // hands. Ringing is over until somebody sets it up again, and
                // saying so quietly beats retrying a dead key every six hours.
                forget(context);
                return null;
            }
            if (status != 200) return null;

            return parse(read(connection));
        } catch (IOException | org.json.JSONException e) {
            Log.w(TAG, "could not read the reminders", e);
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(HttpURLConnection connection) throws IOException {
        StringBuilder out = new StringBuilder();
        BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8));
        try {
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
        } finally {
            reader.close();
        }
        return out.toString();
    }

    private static List<Reminder> parse(String body) throws org.json.JSONException {
        JSONArray coming = new JSONObject(body).getJSONArray("upcoming");
        List<Reminder> out = new ArrayList<>();

        for (int i = 0; i < coming.length(); i++) {
            JSONObject one = coming.getJSONObject(i);
            /*
             * `at` is the instant; `remindAt` is a wall clock with no offset
             * on the end, which this could never read. It tried, got 0 for
             * every one of them, and skipped the lot — a phone pointed at a
             * server rang for nothing at all. `remindAt` is still read, for
             * an instance older than the app pointed at it.
             */
            long at = instant(one.optString("at", ""));
            if (at <= 0) at = wallClock(one.optString("remindAt", ""));
            if (at <= 0) continue;
            out.add(
                    new Reminder(
                            one.optInt("id", 0),
                            at,
                            one.optString("message", ""),
                            one.optBoolean("audible", false)));
        }
        return out;
    }

    /**
     * An instant: ISO-8601 in UTC, with the `Z` on the end. Parsed by hand
     * because `Instant` is API 26 and this runs back to 23.
     */
    private static long instant(String iso) {
        if (iso.isEmpty()) return 0;
        String[] shapes = {"yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", "yyyy-MM-dd'T'HH:mm:ss'Z'"};
        for (String shape : shapes) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(shape, Locale.US);
                format.setTimeZone(TimeZone.getTimeZone("UTC"));
                Date at = format.parse(iso);
                if (at != null) return at.getTime();
            } catch (ParseException next) {
                // try the other shape
            }
        }
        return 0;
    }

    /**
     * A wall clock with no zone on it, read in this phone's own.
     *
     * Only for an instance too old to send `at`. Which zone it meant is not
     * in the payload, so the phone's is the guess — right for somebody whose
     * account is set to where they are, and late or early by the difference
     * for anybody else. Better than the alternative, which was silence.
     */
    private static long wallClock(String local) {
        if (local.isEmpty()) return 0;
        String[] shapes = {"yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm"};
        for (String shape : shapes) {
            try {
                SimpleDateFormat format = new SimpleDateFormat(shape, Locale.US);
                format.setTimeZone(TimeZone.getDefault());
                format.setLenient(false);
                Date at = format.parse(local);
                if (at != null) return at.getTime();
            } catch (ParseException next) {
                // try the other shape
            }
        }
        return 0;
    }

    private static String join(List<String> ids) {
        StringBuilder out = new StringBuilder();
        for (String id : ids) {
            if (out.length() > 0) out.append(',');
            out.append(id);
        }
        return out.toString();
    }
}
