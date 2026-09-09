package app.ontoplano.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.text.format.DateFormat;
import android.widget.RemoteViews;

import java.util.Date;

/**
 * Today, on the home screen.
 *
 * The widget draws a frame — the date, a refresh button — and hands the list
 * itself to a `RemoteViewsService`, which is the only way to get something
 * scrollable into a widget. Tapping a row opens the app.
 *
 * It holds no data of its own: every refresh asks the instance, so what is on
 * the home screen is what the server said and nothing is left to go stale in
 * two places.
 */
public class TodayWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.ontoplano.widget.REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            manager.updateAppWidget(widgetId, build(context, widgetId));
        }
        manager.notifyAppWidgetViewDataChanged(widgetIds, R.id.widget_list);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);

        if (!ACTION_REFRESH.equals(intent.getAction())) {
            return;
        }

        // The list is a separate process's business, so refreshing is asking it
        // to re-read rather than pushing rows at it.
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, TodayWidgetProvider.class));
        onUpdate(context, manager, ids);
    }

    /** Redraw every widget on the home screen. Used after the settings change. */
    static void refreshAll(Context context) {
        Intent intent = new Intent(context, TodayWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        context.sendBroadcast(intent);
    }

    private static RemoteViews build(Context context, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_today);

        views.setTextViewText(
                R.id.widget_date,
                DateFormat.format(context.getString(R.string.widget_date_format), new Date()));

        Intent listIntent = new Intent(context, TodayWidgetService.class);
        listIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        // The adapter is cached per intent, and two widgets must not share one
        // — the data URI is what makes each intent distinct.
        listIntent.setData(Uri.parse(listIntent.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, listIntent);
        views.setEmptyView(R.id.widget_list, R.id.widget_empty);

        Intent refresh = new Intent(context, TodayWidgetProvider.class);
        refresh.setAction(ACTION_REFRESH);
        views.setOnClickPendingIntent(
                R.id.widget_refresh,
                PendingIntent.getBroadcast(context, widgetId, refresh, flags(0)));

        // One template for every row: a widget cannot give each item its own
        // pending intent, so the list sets a fill-in intent and this carries it.
        //
        // A connected widget's rows are today's plan, so tapping one opens the
        // board — the screen those rows are a picture of. The setup screen is
        // only where an UNCONFIGURED tap lands; sending a configured widget's
        // taps there put a "connect me" form in front of somebody who already
        // had, with nothing to do but press back.
        Intent open =
                Instance.configured(context)
                        ? boardIntent(context)
                        : new Intent(context, WidgetConfigureActivity.class)
                                .putExtra(WidgetConfigureActivity.EXTRA_FROM_WIDGET, true);
        views.setPendingIntentTemplate(
                R.id.widget_list,
                PendingIntent.getActivity(context, widgetId, open, flags(PendingIntent.FLAG_MUTABLE)));

        views.setOnClickPendingIntent(
                R.id.widget_header,
                PendingIntent.getActivity(context, widgetId, launchApp(context), flags(0)));

        // The empty state is a row too, in spirit: "Nothing today" opens the
        // board, where putting something on today lives.
        views.setOnClickPendingIntent(
                R.id.widget_empty,
                PendingIntent.getActivity(
                        context,
                        widgetId,
                        Instance.configured(context)
                                ? boardIntent(context)
                                : new Intent(context, WidgetConfigureActivity.class)
                                        .putExtra(WidgetConfigureActivity.EXTRA_FROM_WIDGET, true),
                        flags(0)));

        return views;
    }

    /**
     * The board, inside this app: a VIEW on the instance's own address, which
     * the app claims — so it opens here rather than in a browser tab.
     */
    private static Intent boardIntent(Context context) {
        Intent view =
                new Intent(Intent.ACTION_VIEW, Uri.parse(Instance.origin(context) + "/planner/board"));
        view.setPackage(context.getPackageName());
        return view;
    }

    /** Opens the app itself — whatever the launcher would open. */
    private static Intent launchApp(Context context) {
        Intent launch =
                context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        return launch != null ? launch : new Intent(context, WidgetConfigureActivity.class);
    }

    private static int flags(int extra) {
        int base = PendingIntent.FLAG_UPDATE_CURRENT | extra;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && (extra & PendingIntent.FLAG_MUTABLE) == 0) {
            base |= PendingIntent.FLAG_IMMUTABLE;
        }
        return base;
    }
}
