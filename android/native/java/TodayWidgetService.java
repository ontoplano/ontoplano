package __PACKAGE__;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/**
 * The list inside the widget.
 *
 * `onDataSetChanged` runs off the main thread, which is what makes it the right
 * place to do the network call: the widget asks the instance once per refresh
 * and holds the answer only until the next one.
 */
public class TodayWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new TodayFactory(getApplicationContext());
    }

    private static final class TodayFactory implements RemoteViewsFactory {
        private final Context context;
        private List<TodayClient.Row> rows = new ArrayList<>();
        private String error;

        TodayFactory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            TodayClient.Result result = TodayClient.fetch(context);
            rows = result.rows;
            error = result.error;
        }

        @Override
        public void onDestroy() {
            rows = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return error != null ? 1 : rows.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (error != null) {
                RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_row);
                views.setTextViewText(R.id.row_lead, "");
                views.setTextViewText(R.id.row_title, error);
                views.setTextViewText(R.id.row_trail, "");
                views.setOnClickFillInIntent(R.id.row_root, new Intent());
                return views;
            }

            TodayClient.Row row = rows.get(position);
            RemoteViews views =
                    new RemoteViews(
                            context.getPackageName(),
                            row.kind == TodayClient.Row.KIND_HEADING
                                    ? R.layout.widget_heading
                                    : R.layout.widget_row);

            if (row.kind == TodayClient.Row.KIND_HEADING) {
                views.setTextViewText(R.id.heading_text, row.title);
                return views;
            }

            views.setTextViewText(R.id.row_lead, row.lead);
            views.setTextViewText(R.id.row_title, row.title);
            views.setTextViewText(R.id.row_trail, row.trail);
            // Something already done reads as finished rather than pending.
            views.setInt(
                    R.id.row_title,
                    "setTextColor",
                    context.getResources()
                            .getColor(row.dimmed ? R.color.widget_dim : R.color.widget_text));
            views.setOnClickFillInIntent(R.id.row_root, new Intent());
            return views;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            // A heading and a row, so the launcher can recycle them separately.
            return 2;
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
