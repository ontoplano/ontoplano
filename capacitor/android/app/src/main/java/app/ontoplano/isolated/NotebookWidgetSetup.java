package app.ontoplano.isolated;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;

/**
 * What the launcher opens when a notebook widget is placed, or reconfigured.
 *
 * Nothing is chosen here. The notebooks, their tabs and what each can be
 * narrowed by are on the instance, and so is the session that can mint the
 * widget's key — so this accepts the widget at once and opens the app on the
 * instance's setup page, which hands the key back through `/widget`.
 */
public class NotebookWidgetSetup extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int slot =
                getIntent() == null
                        ? AppWidgetManager.INVALID_APPWIDGET_ID
                        : getIntent()
                                .getIntExtra(
                                        AppWidgetManager.EXTRA_APPWIDGET_ID,
                                        AppWidgetManager.INVALID_APPWIDGET_ID);
        if (slot == AppWidgetManager.INVALID_APPWIDGET_ID) {
            setResult(RESULT_CANCELED);
            finish();
            return;
        }

        // Placed, whatever happens next: an unconfigured widget says "set me
        // up" and opens this same page when pressed.
        setResult(
                RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, slot));
        NotebookWidget.refreshAll(this);
        startActivity(NotebookWidget.open(this, NotebookWidget.setupPath(this, slot)));
        finish();
    }
}
