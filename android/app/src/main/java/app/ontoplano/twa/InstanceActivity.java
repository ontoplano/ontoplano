package app.ontoplano.twa;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * The launcher icon, which decides where the app is pointed before opening it.
 *
 * A Trusted Web Activity is generated against one origin and there is no
 * asking it afterwards, so this sits in front: if an instance has been chosen
 * it starts the app at that instance, and if none has it asks. No layout and a
 * translucent theme, so the ordinary case — every launch after the first — is
 * invisible.
 *
 * It is its own activity rather than a branch inside the launcher because
 * `LauncherActivity.onCreate` is what opens the web view, and a subclass
 * cannot decline to call it.
 */
public class InstanceActivity extends Activity {
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);

        Intent next = Instance.origin(this).isEmpty()
                ? new Intent(this, InstanceSetupActivity.class)
                : new Intent(this, LauncherActivity.class);

        // The launcher's own intent carries the deep link, when there is one:
        // opening a link to a particular day has to reach that day rather than
        // the front page, and this activity is only a fork in the road.
        Intent from = getIntent();
        if (from != null && from.getData() != null) {
            next.setData(from.getData());
            next.setAction(Intent.ACTION_VIEW);
        }

        startActivity(next);
        finish();
    }
}
