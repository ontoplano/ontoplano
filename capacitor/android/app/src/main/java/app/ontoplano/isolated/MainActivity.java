package app.ontoplano.isolated;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /**
     * A page to open, as a path on whichever instance the app opens — what a
     * home-screen widget's press carries. The launch on the device's own copy
     * of the app reads it (`OPENING_PARAM`), because that is where the choice
     * of instance is kept.
     */
    static final String EXTRA_OPEN = "app.ontoplano.OPEN";
    /** The launch's own word for it — `OPENING_PARAM` in `instance-choice.ts`. */
    private static final String OPENING_PARAM = "open";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super, which is where the bridge is built: a plugin registered
        // afterwards is not in the bridge the web view is handed.
        registerPlugin(OntoplanoSettings.class);
        super.onCreate(savedInstanceState);
    }

    /** Every launch passes here, the first one included — see `BridgeActivity.load`. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (bridge == null || intent == null) return;

        String page = intent.getStringExtra(EXTRA_OPEN);
        if (page == null || page.isEmpty()) return;
        // Once: a rotation re-delivers the same intent, and must not navigate again.
        intent.removeExtra(EXTRA_OPEN);

        String launch =
                Uri.parse(bridge.getLocalUrl())
                        .buildUpon()
                        .path("/")
                        .appendQueryParameter(OPENING_PARAM, page)
                        .build()
                        .toString();
        bridge.getWebView().post(() -> bridge.getWebView().loadUrl(launch));
    }
}
