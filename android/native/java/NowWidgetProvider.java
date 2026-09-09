package __PACKAGE__;

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

import java.util.Calendar;

/**
 * The one thing that is happening.
 *
 * Not a list. A home screen is glanced at, and a list asks to be read — so
 * this answers the single question a glance is asking: what am I meant to be
 * doing, and how much of it is left. Its own category's colour, a bar that
 * fills as the block runs out, and what comes after it in one quiet line.
 *
 * Drawn as a bitmap because `RemoteViews` cannot do a gradient or a rounded
 * progress bar, and a widget that looks like a settings screen is a widget
 * nobody keeps on their home screen.
 */
public class NowWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.ontoplano.widget.NOW_REFRESH";

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
                manager.getAppWidgetIds(new ComponentName(context, NowWidgetProvider.class)));
    }

    static void refreshAll(Context context) {
        Intent intent = new Intent(context, NowWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        context.sendBroadcast(intent);
    }

    private static RemoteViews build(
            Context context, AppWidgetManager manager, int widgetId, BoardClient.Board board) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_canvas);
        views.setImageViewBitmap(R.id.widget_canvas, draw(context, manager, widgetId, board));
        views.setOnClickPendingIntent(R.id.widget_canvas, openApp(context));
        return views;
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(Instance.origin(context).isEmpty()
                ? "__ORIGIN__" : Instance.origin(context)));
        int flags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        return PendingIntent.getActivity(context, 0, intent, flags);
    }

    /** The widget's real size in pixels, so nothing is drawn to a guess. */
    private static int[] sizeOf(Context context, AppWidgetManager manager, int widgetId) {
        float density = context.getResources().getDisplayMetrics().density;
        int wDp = manager.getAppWidgetOptions(widgetId)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int hDp = manager.getAppWidgetOptions(widgetId)
                .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110);
        return new int[]{Math.round(wDp * density), Math.round(hDp * density)};
    }

    private static Bitmap draw(
            Context context, AppWidgetManager manager, int widgetId, BoardClient.Board board) {
        int[] size = sizeOf(context, manager, widgetId);
        int w = size[0];
        int h = size[1];
        Bitmap bitmap = WidgetPaint.bitmap(w, h);
        Canvas canvas = new Canvas(bitmap);

        Calendar now = Calendar.getInstance();
        int minuteOfDay = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);

        BoardClient.Block current = null;
        BoardClient.Block next = null;
        for (BoardClient.Block block : board.blocks) {
            int end = block.startsAt + block.minutes;
            if (block.startsAt <= minuteOfDay && minuteOfDay < end) current = block;
            else if (block.startsAt > minuteOfDay && (next == null || block.startsAt < next.startsAt)) {
                next = block;
            }
        }

        int accent = WidgetPaint.colourFor(current != null ? current.category
                : next != null ? next.category : null);
        WidgetPaint.card(canvas, w, h, accent);

        float pad = h * 0.14f;
        float x = pad;

        if (board.error != null) {
            Paint p = WidgetPaint.text(WidgetPaint.MUTED, h * 0.14f, false);
            canvas.drawText(WidgetPaint.fitted(board.error, p, w - pad * 2), x, h * 0.55f, p);
            return bitmap;
        }

        // The eyebrow: what this line is, said once and quietly.
        Paint eyebrow = WidgetPaint.text(WidgetPaint.MUTED, h * 0.11f, true);
        eyebrow.setLetterSpacing(0.14f);
        canvas.drawText(current != null ? "NOW" : next != null ? "NEXT" : "TODAY", x, pad + h * 0.11f,
                eyebrow);

        BoardClient.Block shown = current != null ? current : next;
        if (shown == null) {
            Paint free = WidgetPaint.text(WidgetPaint.INK, h * 0.20f, true);
            canvas.drawText(WidgetPaint.fitted("Nothing planned", free, w - pad * 2), x, h * 0.55f, free);
            return bitmap;
        }

        Paint title = WidgetPaint.text(WidgetPaint.INK, h * 0.22f, true);
        canvas.drawText(WidgetPaint.fitted(shown.title, title, w - pad * 2), x, h * 0.50f, title);

        Paint when = WidgetPaint.text(WidgetPaint.MUTED, h * 0.13f, false);
        String line = shown.startTime + " · " + shown.minutes + " min";
        if (current != null) {
            int left = Math.max(0, shown.startsAt + shown.minutes - minuteOfDay);
            line = left + " min left";
        }
        canvas.drawText(line, x, h * 0.66f, when);

        // How far through it you are, as a bar rather than a number: a glance
        // reads a length and has to do arithmetic on a percentage.
        float trackTop = h * 0.78f;
        float trackHeight = h * 0.055f;
        RectF track = new RectF(x, trackTop, w - pad, trackTop + trackHeight);
        canvas.drawRoundRect(track, trackHeight / 2, trackHeight / 2,
                WidgetPaint.fill(WidgetPaint.fade(accent, 0.18f)));

        float through = current == null ? 0f
                : Math.min(1f, Math.max(0f, (minuteOfDay - shown.startsAt) / (float) Math.max(1, shown.minutes)));
        if (through > 0) {
            RectF filled = new RectF(x, trackTop, x + (w - pad - x) * through, trackTop + trackHeight);
            canvas.drawRoundRect(filled, trackHeight / 2, trackHeight / 2, WidgetPaint.fill(accent));
        }

        // And what comes after, so the widget answers "and then?" without being
        // asked twice.
        if (current != null && next != null) {
            Paint after = WidgetPaint.text(WidgetPaint.MUTED, h * 0.11f, false);
            canvas.drawText(
                    WidgetPaint.fitted("then " + next.startTime + " " + next.title, after, w - pad * 2),
                    x, h * 0.95f, after);
        }

        return bitmap;
    }
}
