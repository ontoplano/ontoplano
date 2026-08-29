package __PACKAGE__;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Where the widget is connected to an instance.
 *
 * Nobody types a token here. Connect opens the instance in the browser — where
 * a session already exists, because the app is that browser — the page mints a
 * key scoped to today alone, and comes back on the ontoplano://widget link
 * with the key aboard.
 *
 * The return may not land in this instance. When the launcher places a widget
 * it starts this screen for a result, and Android ignores singleTask for such
 * launches — so the link from the browser opens a SECOND instance, one with no
 * widget id and no launcher listening. That instance saves the key and closes;
 * this one, the one the launcher is waiting on, notices the new key in
 * onResume and finishes with RESULT_OK. Either instance getting the link ends
 * with the widget placed.
 *
 * The address field stays, prefilled with the instance this app was built for:
 * somebody self-hosting can point the widget somewhere else without a rebuild.
 */
public class WidgetConfigureActivity extends Activity {
    /** Set when the widget itself opened this, rather than the launcher placing one. */
    public static final String EXTRA_FROM_WIDGET = "from_widget";

    private static final String STATE_WAITING = "waiting";
    private static final String STATE_TOKEN_BEFORE = "token_before";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    /** True between tapping Connect and the key arriving, by whatever path. */
    private boolean waiting = false;
    /** The key that existed before Connect, so a fresh one is recognizable. */
    private String tokenBefore = "";

    private EditText origin;
    private TextView status;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.widget_configure);

        // Placing a widget and cancelling must leave nothing behind, so the
        // result is set to cancelled until the connection says otherwise.
        setResult(RESULT_CANCELED);

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            widgetId = extras.getInt(
                    AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }

        if (state != null) {
            waiting = state.getBoolean(STATE_WAITING, false);
            tokenBefore = state.getString(STATE_TOKEN_BEFORE, "");
        }

        origin = findViewById(R.id.configure_origin);
        status = findViewById(R.id.configure_status);
        Button connect = findViewById(R.id.configure_connect);

        String saved = WidgetSettings.origin(this);
        origin.setText(saved.isEmpty() ? getString(R.string.configure_default_origin) : saved);

        connect.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                String address = normalize(origin.getText().toString());
                if (address.isEmpty()) {
                    status.setText(R.string.configure_needs_address);
                    return;
                }

                try {
                    tokenBefore = WidgetSettings.token(WidgetConfigureActivity.this);
                    waiting = true;
                    startActivity(new Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse(address + "/settings/integrations/widget")));
                    status.setText(R.string.configure_waiting);
                } catch (ActivityNotFoundException e) {
                    waiting = false;
                    status.setText(R.string.configure_no_browser);
                }
            }
        });

        handleReturn(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleReturn(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        // The browser's return may have landed in another instance of this
        // screen (see the class comment). That instance saved the key before
        // closing — a key that was not there when Connect was tapped means
        // the connection happened, and this instance can answer the launcher.
        if (waiting) {
            String token = WidgetSettings.token(this);
            if (!token.isEmpty() && !token.equals(tokenBefore)) {
                waiting = false;
                status.setText(R.string.configure_checking);
                verifyAndFinish();
            }
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        out.putBoolean(STATE_WAITING, waiting);
        out.putString(STATE_TOKEN_BEFORE, tokenBefore);
    }

    /**
     * The way back: ontoplano://widget?origin=…&token=….
     *
     * Any app on the phone could register this scheme and catch the same link,
     * which is why the key it carries can read today's list and nothing else.
     */
    private void handleReturn(Intent intent) {
        Uri data = intent.getData();
        if (data == null || !"widget".equals(data.getHost())) {
            return;
        }

        String linkOrigin = data.getQueryParameter("origin");
        String token = data.getQueryParameter("token");
        if (linkOrigin == null || linkOrigin.isEmpty() || token == null || token.isEmpty()) {
            status.setText(R.string.configure_bad_link);
            return;
        }

        waiting = false;
        status.setText(R.string.configure_checking);
        WidgetSettings.save(this, linkOrigin, token);
        verifyAndFinish();
    }

    /**
     * Saved first, then checked: the check reads what was saved, and a key
     * that is written down is easier to replace than one that vanished when
     * the check failed.
     */
    private void verifyAndFinish() {
        worker.execute(new Runnable() {
            @Override
            public void run() {
                final TodayClient.Result result = TodayClient.fetch(WidgetConfigureActivity.this);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (result.error != null) {
                            status.setText(result.error);
                            return;
                        }
                        finishWithSuccess();
                    }
                });
            }
        });
    }

    /** A pasted address arrives with trailing slashes and no scheme more often than not. */
    private static String normalize(String address) {
        String trimmed = address.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        if (!trimmed.isEmpty() && !trimmed.contains("://")) {
            trimmed = "https://" + trimmed;
        }
        return trimmed;
    }

    @Override
    protected void onDestroy() {
        worker.shutdown();
        super.onDestroy();
    }

    private void finishWithSuccess() {
        TodayWidgetProvider.refreshAll(this);

        if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
            Intent result = new Intent();
            result.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
            setResult(RESULT_OK, result);
        } else {
            setResult(RESULT_OK);
        }

        finish();
    }
}
