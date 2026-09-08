package app.ontoplano.twa;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;

/**
 * The drawing the widgets share.
 *
 * A widget is `RemoteViews`, which is a fixed set of stock views assembled in
 * another process — no custom view, no canvas, no shaders. What it does have
 * is an `ImageView`, and an app is allowed to hand it a bitmap. So anything
 * that has to look like it was designed is drawn here, into a bitmap, at the
 * exact pixel size the launcher gave the widget.
 *
 * Everything is in device pixels worked out from the widget's real size rather
 * than a fixed number, because the same widget is 300px wide on one phone and
 * 900 on a tablet, and a design that only holds at one width is a design that
 * mostly does not hold.
 */
final class WidgetPaint {
    /** The app's own ink, matching what the web app uses in the dark. */
    static final int INK = 0xFFE6EDF3;
    static final int MUTED = 0xFF8B949E;
    static final int GROUND = 0xFF0B1220;
    static final int RAISED = 0xFF161B22;
    static final int LINE = 0x22FFFFFF;
    static final int BLUE = 0xFF1F6FEB;

    /** The category colours, in the order the app assigns them. */
    private static final int[] CATEGORY_COLOURS = {
            0xFF1D4ED8, 0xFF0F766E, 0xFFB45309, 0xFF9333EA, 0xFFBE123C, 0xFF0369A1, 0xFF4D7C0F
    };

    private WidgetPaint() {}

    /**
     * A stable colour for a category name.
     *
     * The widget is not told the category's colour — the endpoint sends a name
     * — so it picks one from the name itself. The same name is always the same
     * colour, which is what makes a week of bars readable even though the hues
     * are not the ones the app chose.
     */
    static int colourFor(String category) {
        if (category == null || category.isEmpty()) return BLUE;
        int hash = 0;
        for (int i = 0; i < category.length(); i++) hash = hash * 31 + category.charAt(i);
        return CATEGORY_COLOURS[Math.abs(hash) % CATEGORY_COLOURS.length];
    }

    static int fade(int colour, float alpha) {
        int a = Math.round(Math.max(0f, Math.min(1f, alpha)) * 255f);
        return (a << 24) | (colour & 0x00FFFFFF);
    }

    static Bitmap bitmap(int width, int height) {
        return Bitmap.createBitmap(Math.max(1, width), Math.max(1, height), Bitmap.Config.ARGB_8888);
    }

    static Paint fill(int colour) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(colour);
        paint.setStyle(Paint.Style.FILL);
        return paint;
    }

    static Paint stroke(int colour, float width) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(colour);
        paint.setStyle(Paint.Style.STROKE);
        paint.setStrokeWidth(width);
        paint.setStrokeCap(Paint.Cap.ROUND);
        return paint;
    }

    static Paint text(int colour, float size, boolean bold) {
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setColor(colour);
        paint.setTextSize(size);
        paint.setTypeface(Typeface.create(Typeface.DEFAULT, bold ? Typeface.BOLD : Typeface.NORMAL));
        return paint;
    }

    /**
     * The card every drawn widget sits on.
     *
     * A soft vertical gradient rather than a flat fill: flat reads as a hole
     * cut in the wallpaper, and the gradient is what makes it sit on top of it.
     * One hairline, no shadow — a launcher already draws one and two look like
     * a mistake.
     */
    static void card(Canvas canvas, int width, int height, int accent) {
        float radius = height * 0.10f;
        RectF box = new RectF(0, 0, width, height);

        Paint ground = new Paint(Paint.ANTI_ALIAS_FLAG);
        ground.setShader(new LinearGradient(
                0, 0, 0, height,
                new int[]{RAISED, GROUND},
                null,
                Shader.TileMode.CLAMP));
        canvas.drawRoundRect(box, radius, radius, ground);

        // The accent as a wash in the top corner, so the card belongs to
        // whatever it is about without being coloured in.
        Paint wash = new Paint(Paint.ANTI_ALIAS_FLAG);
        wash.setShader(new LinearGradient(
                width * 0.55f, 0, width, height * 0.9f,
                new int[]{fade(accent, 0.20f), fade(accent, 0f)},
                null,
                Shader.TileMode.CLAMP));
        canvas.drawRoundRect(box, radius, radius, wash);

        RectF inset = new RectF(0.5f, 0.5f, width - 0.5f, height - 0.5f);
        canvas.drawRoundRect(inset, radius, radius, stroke(LINE, 1f));
    }

    /** Text cut off with an ellipsis rather than running off the card. */
    static String fitted(String value, Paint paint, float maxWidth) {
        if (value == null) return "";
        if (paint.measureText(value) <= maxWidth) return value;
        String ellipsis = "…";
        float room = maxWidth - paint.measureText(ellipsis);
        int end = value.length();
        while (end > 0 && paint.measureText(value, 0, end) > room) end--;
        return value.substring(0, Math.max(0, end)).trim() + ellipsis;
    }

    /** A rounded bar, drawn from the bottom up. */
    static void bar(Canvas canvas, float left, float bottom, float width, float height, int colour) {
        if (height <= 0) return;
        float radius = Math.min(width / 2f, height / 2f);
        RectF box = new RectF(left, bottom - height, left + width, bottom);
        canvas.drawRoundRect(box, radius, radius, fill(colour));
    }

    /**
     * One arc of a ring, drawn clockwise from the top.
     *
     * The track is always drawn, so an empty ring is a ring and not an absence
     * — three faint circles say "nothing yet today", and three missing ones say
     * the widget is broken.
     */
    static void ring(Canvas canvas, RectF box, float thickness, float fraction, int colour) {
        canvas.drawArc(box, 0, 360, false, stroke(fade(colour, 0.16f), thickness));
        if (fraction <= 0) return;
        canvas.drawArc(box, -90, 360f * Math.min(1f, fraction), false, stroke(colour, thickness));
    }
}
