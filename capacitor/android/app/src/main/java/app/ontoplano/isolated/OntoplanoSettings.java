package app.ontoplano.isolated;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The one door out of a permission Android will not ask about twice.
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
