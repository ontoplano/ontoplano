package app.ontoplano.isolated;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The small things the shell can do and a web page cannot.
 *
 * Two of them, and both exist because the web view runs out of reach of the
 * phone: the settings screen Android will not open for a page, and the alarm
 * clock that rings for an instance which has no way to wake this device.
 *
 * ## The door out of a permission Android will not ask about twice
 *
 * On Android 13 and up, a person who has refused notifications twice is never
 * shown the dialog again: requestPermissions() returns "denied" immediately
 * and nothing appears. The only way back is the system's own settings screen,
 * and until this existed the app could do no more than describe where that
 * screen is — which leaves somebody who wants reminders reading directions
 * instead of pressing a button.
 *
 * Written here rather than pulled in as a plugin: it is one intent, and a
 * dependency for one intent is a version to keep, a licence to check and
 * another thing between this app and F-Droid building it.
 */
@CapacitorPlugin(name = "OntoplanoSettings")
public class OntoplanoSettings extends Plugin {

    /**
     * Ring on this phone for the instance at `origin`, using `token`.
     *
     * Handed over by the copy of the app the phone carries — the only page with
     * a bridge to this class — after the instance itself has minted a key that
     * can read its reminders and nothing else. Saved natively, because the
     * point is to work when no page is open at all.
     */
    @PluginMethod
    public void ringFor(PluginCall call) {
        String origin = call.getString("origin", "");
        String token = call.getString("token", "");

        if (origin == null || origin.isEmpty() || token == null || token.isEmpty()) {
            call.reject("An instance and a key, both.");
            return;
        }

        Ringer.remember(getContext(), origin, token);
        Ringer.sync(getContext());
        call.resolve();
    }

    /** Stop ringing for it, and drop the key. */
    @PluginMethod
    public void stopRinging(PluginCall call) {
        Ringer.forget(getContext());
        call.resolve();
    }

    /** Which instance this phone rings for, or an empty string for none. */
    @PluginMethod
    public void ringingFor(PluginCall call) {
        JSObject answer = new JSObject();
        answer.put("origin", Ringer.origin(getContext()));
        call.resolve(answer);
    }

    /**
     * Ask the instance now, rather than waiting for the standing refresh.
     *
     * What the app calls when it opens: somebody who has just written a
     * reminder and closed the app expects that one to ring, and six hours is a
     * long time to be wrong about it.
     */
    @PluginMethod
    public void syncReminders(PluginCall call) {
        Ringer.sync(getContext());
        call.resolve();
    }

    /**
     * Whether this phone will actually ring, link by link.
     *
     * The app's one job with the screen off, and the one thing it could not
     * answer for itself: the alarms are booked by a receiver with nobody
     * watching, so "it did not go off" had no follow-up question. See
     * `Ringer.status` for what each field means.
     */
    @PluginMethod
    public void ringerStatus(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(Ringer.status(getContext())));
        } catch (org.json.JSONException broken) {
            // `status` builds this object itself and never puts anything a
            // JSObject cannot hold; a page that asked deserves an answer
            // rather than a rejection it would have to handle.
            call.resolve(new JSObject());
        }
    }

    /**
     * The screen where Android lets an app book alarms at a minute.
     *
     * Only reachable from 12 up, and only worth offering when the answer is
     * currently no — which the page decides from `ringerStatus`.
     */
    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.S) {
            call.resolve();
            return;
        }
        Intent exact = new Intent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM")
                .setData(Uri.parse("package:" + getContext().getPackageName()))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (start(exact)) {
            call.resolve();
            return;
        }
        // Every Android has the app's own details page, even where that one
        // screen does not exist.
        openNotificationSettings(call);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        String app = getContext().getPackageName();

        Intent notifications = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, app)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (start(notifications)) {
            call.resolve();
            return;
        }

        // Every Android has the app's own details page, even where the
        // notification screen above is missing or refuses the intent. One more
        // tap for the person, and never a button that does nothing.
        Intent details = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.fromParts("package", app, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        if (start(details)) {
            call.resolve();
        } else {
            call.reject("This phone has no settings screen for the app.");
        }
    }

    private boolean start(Intent intent) {
        try {
            getContext().startActivity(intent);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
