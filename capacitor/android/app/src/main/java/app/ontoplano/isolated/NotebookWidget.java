package app.ontoplano.isolated;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * One tab of one notebook, on the home screen.
 *
 * The frame is drawn here — the notebook and tab in the header, a refresh
 * button — and the lines by `NotebookWidgetService`, which is the only way to
 * put a scrolling list in a widget. Pressing the header opens the notebook on
 * that tab; pressing a line opens that one thing. Both go through the app's
 * own launch (`MainActivity.EXTRA_OPEN`), which knows which instance the app
 * opens and a widget does not.
 *
 * A widget that has not been set up — or whose key was revoked — opens the
 * setup page instead, on the instance, where the notebook and tab are chosen.
 */
public class NotebookWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.ontoplano.widget.NOTEBOOK_REFRESH";

    /** Where a widget is set up, on the instance — `WIDGET_SETUP_PATH`. */
    static final String SETUP_PATH = "/settings/integrations/widget";
    /** The query the setup page reads — `HANDOFF_SLOT`, `HANDOFF_WIDGET`. */
    static final String SLOT_PARAM = "slot";
    static final String WIDGET_PARAM = "widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] slots) {
        for (int slot : slots) manager.updateAppWidget(slot, frame(context, slot));
        manager.notifyAppWidgetViewDataChanged(slots, R.id.notebook_widget_list);
    }

    @Override
    public void onDeleted(Context context, int[] slots) {
        // The key stays valid on the instance until it is deleted there; the
        // widget row under Settings says so, and removing it revokes the key.
        for (int slot : slots) NotebookWidgetClient.forget(context, slot);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_REFRESH.equals(intent.getAction())) return;
        refreshAll(context);
    }

    /** Read every notebook widget again — after one is set up or edited. */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] slots = manager.getAppWidgetIds(new ComponentName(context, NotebookWidget.class));
        for (int slot : slots) manager.updateAppWidget(slot, frame(context, slot));
        manager.notifyAppWidgetViewDataChanged(slots, R.id.notebook_widget_list);
    }

    /** Redraw one widget's header, after its list has learned what it is showing. */
    static void redrawHeader(Context context, int slot) {
        // Partial, so the list is not bound again — which would ask again.
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notebook_widget);
        header(context, slot, views);
        AppWidgetManager.getInstance(context).partiallyUpdateAppWidget(slot, views);
    }

    /** The setup page for this widget: a new one, or the one it already is. */
    static String setupPath(Context context, int slot) {
        Uri.Builder path = Uri.parse(SETUP_PATH).buildUpon();
        path.appendQueryParameter(SLOT_PARAM, String.valueOf(slot));
        int widget = NotebookWidgetClient.widget(context, slot);
        if (widget > 0) path.appendQueryParameter(WIDGET_PARAM, String.valueOf(widget));
        return path.build().toString();
    }

    /** The app, opened on `page` — a path on the chosen instance. */
    static Intent open(Context context, String page) {
        return new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .putExtra(MainActivity.EXTRA_OPEN, page)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    }

    private static RemoteViews frame(Context context, int slot) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.notebook_widget);
        boolean bound = NotebookWidgetClient.bound(context, slot);
        header(context, slot, views);

        Intent list = new Intent(context, NotebookWidgetService.class)
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, slot);
        // The adapter is cached per intent, and two widgets must not share one.
        list.setData(Uri.parse(list.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.notebook_widget_list, list);
        views.setEmptyView(R.id.notebook_widget_list, R.id.notebook_widget_empty);
        views.setTextViewText(
                R.id.notebook_widget_empty,
                context.getString(
                        bound ? R.string.notebook_widget_nothing : R.string.notebook_widget_set_up));

        views.setOnClickPendingIntent(
                R.id.notebook_widget_empty,
                PendingIntent.getActivity(
                        context, pressCode(slot), open(context, headerPage(context, slot)), flags(0)));

        // One template for every line; each line fills in its own page.
        views.setPendingIntentTemplate(
                R.id.notebook_widget_list,
                PendingIntent.getActivity(
                        context,
                        lineCode(slot),
                        new Intent(context, MainActivity.class)
                                .setAction(Intent.ACTION_VIEW)
                                .addFlags(
                                        Intent.FLAG_ACTIVITY_NEW_TASK
                                                | Intent.FLAG_ACTIVITY_SINGLE_TOP),
                        flags(PendingIntent.FLAG_MUTABLE)));

        Intent refresh = new Intent(context, NotebookWidget.class).setAction(ACTION_REFRESH);
        views.setOnClickPendingIntent(
                R.id.notebook_widget_refresh,
                PendingIntent.getBroadcast(context, slot, refresh, flags(0)));
        return views;
    }

    /** The notebook's tab once the widget has read it; the setup page until then. */
    private static String headerPage(Context context, int slot) {
        String href = NotebookWidgetClient.href(context, slot);
        return NotebookWidgetClient.bound(context, slot) && !href.isEmpty()
                ? href
                : setupPath(context, slot);
    }

    private static void header(Context context, int slot, RemoteViews views) {
        String title = NotebookWidgetClient.title(context, slot);
        views.setTextViewText(
                R.id.notebook_widget_title,
                title.isEmpty() ? context.getString(R.string.notebook_widget_name) : title);
        views.setTextViewText(
                R.id.notebook_widget_section,
                sectionName(context, NotebookWidgetClient.section(context, slot)));
        views.setOnClickPendingIntent(
                R.id.notebook_widget_header,
                PendingIntent.getActivity(
                        context, pressCode(slot), open(context, headerPage(context, slot)), flags(0)));
    }

    private static String sectionName(Context context, String section) {
        switch (section) {
            case "notes":
                return context.getString(R.string.notebook_widget_section_notes);
            case "tasks":
                return context.getString(R.string.notebook_widget_section_tasks);
            case "goals":
                return context.getString(R.string.notebook_widget_section_goals);
            case "ideas":
                return context.getString(R.string.notebook_widget_section_ideas);
            case "inventory":
                return context.getString(R.string.notebook_widget_section_inventory);
            default:
                return "";
        }
    }

    /*
     * Android tells two pending intents apart by their intent without its
     * extras — and the header's and the lines' are the same activity. Distinct
     * request codes keep the lines' mutable template from replacing the
     * header's immutable one.
     */
    private static int pressCode(int slot) {
        return slot * 2;
    }

    private static int lineCode(int slot) {
        return slot * 2 + 1;
    }

    static int flags(int extra) {
        int base = PendingIntent.FLAG_UPDATE_CURRENT | extra;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && (extra & PendingIntent.FLAG_MUTABLE) == 0) {
            base |= PendingIntent.FLAG_IMMUTABLE;
        }
        return base;
    }
}
