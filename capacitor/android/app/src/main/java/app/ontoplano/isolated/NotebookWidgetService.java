package app.ontoplano.isolated;

import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/**
 * The lines inside a notebook widget.
 *
 * `onDataSetChanged` runs off the main thread, which makes it the place for
 * the network call: one question to the instance per refresh, and the answer
 * held only until the next one.
 */
public class NotebookWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int slot =
                intent.getIntExtra(
                        AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        return new Lines(getApplicationContext(), slot);
    }

    private static final class Lines implements RemoteViewsFactory {
        private final Context context;
        private final int slot;
        private List<NotebookWidgetClient.Item> items = new ArrayList<>();
        private String trouble;

        Lines(Context context, int slot) {
            this.context = context;
            this.slot = slot;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            NotebookWidgetClient.Result result = NotebookWidgetClient.fetch(context, slot);
            items = result.items;
            // Not set up is the empty view's to say, not a line's.
            trouble =
                    NotebookWidgetClient.TROUBLE_UNBOUND.equals(result.trouble)
                            ? null
                            : result.trouble;
            // The header names what the answer was about, which only now is known.
            new Handler(Looper.getMainLooper())
                    .post(() -> NotebookWidget.redrawHeader(context, slot));
        }

        @Override
        public void onDestroy() {
            items = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return trouble != null ? 1 : items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews views =
                    new RemoteViews(context.getPackageName(), R.layout.notebook_widget_row);

            if (trouble != null) {
                boolean refused = NotebookWidgetClient.TROUBLE_REFUSED.equals(trouble);
                views.setTextViewText(
                        R.id.notebook_widget_row_title,
                        context.getString(
                                refused
                                        ? R.string.notebook_widget_refused
                                        : R.string.notebook_widget_unreachable));
                views.setTextViewText(R.id.notebook_widget_row_detail, "");
                views.setOnClickFillInIntent(
                        R.id.notebook_widget_row,
                        new Intent()
                                .putExtra(
                                        MainActivity.EXTRA_OPEN,
                                        NotebookWidget.setupPath(context, slot)));
                return views;
            }

            NotebookWidgetClient.Item item = items.get(position);
            views.setTextViewText(R.id.notebook_widget_row_title, item.title);
            views.setTextViewText(R.id.notebook_widget_row_detail, item.detail);
            // Finished reads as finished rather than pending.
            views.setTextColor(
                    R.id.notebook_widget_row_title,
                    context.getColor(
                            item.done ? R.color.notebook_widget_dim : R.color.notebook_widget_text));
            views.setOnClickFillInIntent(
                    R.id.notebook_widget_row,
                    new Intent().putExtra(MainActivity.EXTRA_OPEN, item.href));
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
