package __PACKAGE__;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Where the widget is told which instance to read, and with what token.
 *
 * A TWA has no native settings screen — the app is the website — so this is the
 * one piece of native UI the app has. It opens when the widget is placed, and
 * again from the widget itself when it has nothing to show.
 *
 * The token is a scoped one from Settings → Integrations, with `today:read` and
 * nothing else: a widget sitting on a lock screen should not carry a key to the
 * diary.
 */
public class WidgetConfigureActivity extends Activity {
    /** Set when the widget itself opened this, rather than the launcher placing one. */
    public static final String EXTRA_FROM_WIDGET = "from_widget";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.widget_configure);

        // Placing a widget and cancelling must leave nothing behind, so the
        // result is set to cancelled until Save says otherwise.
        setResult(RESULT_CANCELED);

        Bundle extras = getIntent().getExtras();
        if (extras != null) {
            widgetId = extras.getInt(
                    AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        }

        final EditText origin = findViewById(R.id.configure_origin);
        final EditText token = findViewById(R.id.configure_token);
        final TextView status = findViewById(R.id.configure_status);
        Button save = findViewById(R.id.configure_save);

        origin.setText(WidgetSettings.origin(this));
        token.setText(WidgetSettings.token(this));

        save.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                final String originText = origin.getText().toString().trim();
                final String tokenText = token.getText().toString().trim();

                if (originText.isEmpty() || tokenText.isEmpty()) {
                    status.setText(R.string.configure_needs_both);
                    return;
                }

                status.setText(R.string.configure_checking);
                WidgetSettings.save(WidgetConfigureActivity.this, originText, tokenText);

                // Saved first, then checked: the check reads what was saved, and
                // a wrong token that is written down is easier to correct than
                // one that vanished when the check failed.
                worker.execute(new Runnable() {
                    @Override
                    public void run() {
                        final TodayClient.Result result =
                                TodayClient.fetch(WidgetConfigureActivity.this);
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
        });
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
