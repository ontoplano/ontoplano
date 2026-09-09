package app.ontoplano.twa;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.widget.RemoteViews;

/**
 * The day as three rings.
 *
 * Blocks, habits, todos — the three things a day is made of here, each as an
 * arc that closes as you go. A ring is read in the time it takes to look at
 * it, which is all a home screen ever gets, and three of them side by side say
 * something a list of numbers cannot: which part of today you are neglecting.
 *
 * The track is always drawn. An empty ring is a ring; a missing one is a
 * broken widget, and at seven in the morning those must not look the same.
 */
public class RingsWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.ontoplano.widget.RINGS_REFRESH";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) {
            new Thread(() -> {
                BoardClient.Board board = BoardClient.load(context);
                manager.updateAppWidget(widgetId, build(context, manager, widgetId, board));
            }).start();
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (!ACTION_REFRESH.equals(intent.getAction())) return;
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        onUpdate(context, manager,
                manager.getAppWidgetIds(new ComponentName(context, RingsWidgetProvider.class)));
    }

    static void refreshAll(Context context) {
        Intent intent = new Intent(context, RingsWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        context.sendBroadcast(intent);
    }

    private static RemoteViews build(
            Context context, AppWidgetManager manager, int widgetId, BoardClient.Board board) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_canvas);
        views.setImageViewBitmap(R.id.widget_canvas, draw(context, manager, widgetId, board));

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(
                Instance.origin(context).isEmpty() ? "https://app.ontoplano.com" : Instance.origin(context)));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        views.setOnClickPendingIntent(R.id.widget_canvas,
                PendingIntent.getActivity(context, 0, intent, flags));
        return views;
    }

    private static Bitmap draw(
            Context context, AppWidgetManager manager, int widgetId, BoardClient.Board board) {
        float density = context.getResources().getDisplayMetrics().density;
        int w = Math.round(manager.getAppWidgetOptions(widgetId)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250) * density);
        int h = Math.round(manager.getAppWidgetOptions(widgetId)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110) * density);

        Bitmap bitmap = WidgetPaint.bitmap(w, h);
        Canvas canvas = new Canvas(bitmap);
        WidgetPaint.card(canvas, w, h, WidgetPaint.BLUE);

        if (board.error != null) {
            Paint p = WidgetPaint.text(WidgetPaint.MUTED, h * 0.14f, false);
            canvas.drawText(WidgetPaint.fitted(board.error, p, w * 0.9f), h * 0.14f, h * 0.55f, p);
            return bitmap;
        }

        int blocksDone = 0;
        for (BoardClient.Block block : board.blocks) if (block.done) blocksDone++;

        float[][] arcs = {
                {blocksDone, board.blocks.size()},
                {board.habitsDone, board.habitsTotal},
                {board.tasksDone, board.tasksTotal}
        };
        int[] colours = {WidgetPaint.BLUE, 0xFF0F766E, 0xFFB45309};
        String[] labels = {"blocks", "habits", "todos"};

        // Three across, each in its own third, so the widget reflows rather
        // than crops when the launcher gives it a different width.
        float third = w / 3f;
        float diameter = Math.min(third * 0.62f, h * 0.52f);
        float thickness = diameter * 0.13f;
        float top = h * 0.20f;

        for (int i = 0; i < arcs.length; i++) {
            float centreX = third * i + third / 2f;
            RectF box = new RectF(
                    centreX - diameter / 2f, top,
                    centreX + diameter / 2f, top + diameter);

            float total = arcs[i][1];
            float done = arcs[i][0];
            WidgetPaint.ring(canvas, box, thickness, total == 0 ? 0 : done / total, colours[i]);

            // The count in the middle: the ring says how much, the number says
            // how many, and both are wanted at different moments.
            Paint count = WidgetPaint.text(WidgetPaint.INK, diameter * 0.30f, true);
            String value = total == 0 ? "–" : (int) done + "/" + (int) total;
            count.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(value, centreX, top + diameter / 2f + diameter * 0.11f, count);

            Paint label = WidgetPaint.text(WidgetPaint.MUTED, h * 0.105f, false);
            label.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(labels[i], centreX, top + diameter + h * 0.15f, label);
        }

        return bitmap;
    }
}
