package app.ontoplano.isolated;

import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * What happens when one of those alarms goes off — and what keeps them coming.
 *
 * Three jobs, because they are three reasons the same class is woken:
 *
 *   **ring**      an alarm reached its minute: put the reminder on the screen.
 *   **refresh**   the standing alarm that asks the instance for the next list,
 *                 which is what makes a reminder written this afternoon ring
 *                 tonight without the app being opened in between.
 *   **boot**      alarms do not survive a restart. Nothing else notices, so the
 *                 phone would go quiet until somebody happened to open the app.
 */
public class RingerReceiver extends BroadcastReceiver {
    static final String ACTION_RING = "app.ontoplano.RING";
    static final String ACTION_REFRESH = "app.ontoplano.REFRESH_REMINDERS";
    static final String EXTRA_MESSAGE = "message";
    static final String EXTRA_AUDIBLE = "audible";

    /** Ids for what is on screen; the same range the alarms were booked in. */
    private static final int SHOWN_BASE = 2_000_000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent == null ? "" : String.valueOf(intent.getAction());

        if (ACTION_RING.equals(action)) {
            show(context, intent);
            return;
        }

        // Everything else — the refresh alarm, and a phone that has just
        // started — means the same thing: ask again and book what comes back.
        Ringer.sync(context);
    }

    private void show(Context context, Intent intent) {
        String message = String.valueOf(intent.getStringExtra(EXTRA_MESSAGE));
        if (message.isEmpty() || "null".equals(message)) return;

        Ringer.ensureChannel(context);

        /*
         * Opening it opens the app, which is the only useful thing to do with a
         * reminder — and the app opens on whichever instance this phone was
         * pointed at, which is the one the reminder came from.
         */
        Intent open = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        PendingIntent tap =
                open == null
                        ? null
                        : PendingIntent.getActivity(
                                context,
                                0,
                                open,
                                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder note =
                new NotificationCompat.Builder(context, Ringer.CHANNEL)
                        .setSmallIcon(R.drawable.ic_stat_ontoplano)
                        // Android keeps only the alpha of a small icon, so the
                        // mark arrives as a white silhouette whatever it is
                        // drawn in. The accent is the one colour the system
                        // takes, and it is generated from the same number the
                        // app's own notifications use — see
                        // scripts/brand-android.mjs.
                        .setColor(ContextCompat.getColor(context, R.color.ontoplano_accent))
                        .setContentTitle(context.getString(R.string.app_name))
                        .setContentText(message)
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(message))
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_HIGH);

        // Silent ones are still worth showing; what `audible` decides is
        // whether the phone makes a noise about it.
        if (!intent.getBooleanExtra(EXTRA_AUDIBLE, false)) {
            note.setSilent(true);
        }
        if (tap != null) note.setContentIntent(tap);

        NotificationManager manager =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        /*
         * Android 13 and up will not show this without the permission, and
         * asking for it is the web side's job — it has a screen and a person
         * looking at it. Here the honest thing is to post and let the system
         * drop it, rather than to keep a second opinion about what is allowed.
         */
        manager.notify(SHOWN_BASE + (int) (System.currentTimeMillis() % 100000), note.build());
    }
}
