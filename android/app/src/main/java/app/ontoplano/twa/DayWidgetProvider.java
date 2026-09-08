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

import java.util.Calendar;

/**
 * The day as a shape.
 *
 * One horizontal strip from the first block to the last, with every block on it
 * in its own colour and a line where you are now. It is the planner's own
 * picture — the thing the grid says at a glance, which is how full a day is and
 * where the gaps are — laid flat enough to live on a home screen.
 *
 * No text on the blocks. At this size a name is four characters and an
 * ellipsis, which is worse than nothing; the shape is the information, and the
 * app is one tap away for the rest.
 */
public class DayWidgetProvider extends AppWidgetProvider {
    static final String ACTION_REFRESH = "app.ontoplano.widget.DAY_REFRESH";

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
                manager.getAppWidgetIds(new ComponentName(context, DayWidgetProvider.class)));
    }

    static void refreshAll(Context context) {
        Intent intent = new Intent(context, DayWidgetProvider.class);
        intent.setAction(ACTION_REFRESH);
        context.sendBroadcast(intent);
    }

    private static RemoteViews build(
            Context context, AppWidgetManager manager, int widgetId, BoardClient.Board board) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_canvas);
        views.setImageViewBitmap(R.id.widget_canvas, draw(context, manager, widgetId, board));

        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(
                WidgetSettings.origin(context).isEmpty() ? "https://app.ontoplano.com" : WidgetSettings.origin(context)));
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

        float pad = h * 0.16f;

        if (board.error != null) {
            Paint p = WidgetPaint.text(WidgetPaint.MUTED, h * 0.14f, false);
            canvas.drawText(WidgetPaint.fitted(board.error, p, w - pad * 2), pad, h * 0.55f, p);
            return bitmap;
        }

        if (board.blocks.isEmpty()) {
            Paint p = WidgetPaint.text(WidgetPaint.INK, h * 0.18f, true);
            canvas.drawText("A free day", pad, h * 0.58f, p);
            return bitmap;
        }

        // The window is the day that was actually planned, not midnight to
        // midnight: an hour of blocks in a 24-hour strip is a smear.
        int first = 24 * 60;
        int last = 0;
        for (BoardClient.Block block : board.blocks) {
            first = Math.min(first, block.startsAt);
            last = Math.max(last, block.startsAt + block.minutes);
        }
        Calendar now = Calendar.getInstance();
        int minuteOfDay = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        first = Math.min(first, minuteOfDay);
        last = Math.max(last, minuteOfDay);
        // A little air either side, so a block at the very start is not flush
        // against the edge of the card.
        first = Math.max(0, first - 30);
        last = Math.min(24 * 60, last + 30);
        float span = Math.max(1, last - first);

        Paint eyebrow = WidgetPaint.text(WidgetPaint.MUTED, h * 0.105f, true);
        eyebrow.setLetterSpacing(0.14f);
        canvas.drawText("TODAY", pad, pad + h * 0.10f, eyebrow);

        float stripTop = h * 0.36f;
        float stripHeight = h * 0.30f;
        float left = pad;
        float right = w - pad;
        float width = right - left;

        // The ground the day sits on, so the gaps read as gaps rather than as
        // nothing having been drawn.
        RectF ground = new RectF(left, stripTop, right, stripTop + stripHeight);
        canvas.drawRoundRect(ground, stripHeight / 2, stripHeight / 2,
                WidgetPaint.fill(WidgetPaint.fade(WidgetPaint.INK, 0.07f)));

        for (BoardClient.Block block : board.blocks) {
            float x1 = left + width * ((block.startsAt - first) / span);
            float x2 = left + width * ((block.startsAt + block.minutes - first) / span);
            // Never thinner than a couple of pixels: a fifteen-minute block on a
            // twelve-hour day is a hairline, and a hairline is still a thing
            // that is on today.
            if (x2 - x1 < stripHeight * 0.28f) x2 = x1 + stripHeight * 0.28f;

            int colour = WidgetPaint.colourFor(block.category);
            RectF box = new RectF(x1, stripTop, Math.min(x2, right), stripTop + stripHeight);
            canvas.drawRoundRect(box, stripHeight * 0.35f, stripHeight * 0.35f,
                    WidgetPaint.fill(block.done ? WidgetPaint.fade(colour, 0.38f) : colour));
        }

        // Where you are. Drawn over everything, because it is the one mark on
        // here that is about right now.
        float nowX = left + width * ((minuteOfDay - first) / span);
        canvas.drawLine(nowX, stripTop - stripHeight * 0.22f, nowX, stripTop + stripHeight * 1.22f,
                WidgetPaint.stroke(WidgetPaint.INK, Math.max(2f, h * 0.012f)));

        Paint ends = WidgetPaint.text(WidgetPaint.MUTED, h * 0.105f, false);
        canvas.drawText(clock(first), left, h * 0.85f, ends);
        Paint endsRight = WidgetPaint.text(WidgetPaint.MUTED, h * 0.105f, false);
        endsRight.setTextAlign(Paint.Align.RIGHT);
        canvas.drawText(clock(last), right, h * 0.85f, endsRight);

        int done = 0;
        for (BoardClient.Block block : board.blocks) if (block.done) done++;
        Paint score = WidgetPaint.text(WidgetPaint.INK, h * 0.115f, true);
        score.setTextAlign(Paint.Align.CENTER);
        canvas.drawText(done + " of " + board.blocks.size() + " done", (left + right) / 2f, h * 0.85f,
                score);

        return bitmap;
    }

    private static String clock(int minuteOfDay) {
        int hour = (minuteOfDay / 60) % 24;
        int minute = minuteOfDay % 60;
        return String.format("%02d:%02d", hour, minute);
    }
}
