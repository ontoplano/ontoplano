package app.ontoplano.twa;

import android.content.Context;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Reads /api/v1/today and turns it into rows.
 *
 * Deliberately one request: a widget refreshes on a timer, often on mobile
 * data, and three round trips to draw one screen is three chances to be
 * half-drawn. The endpoint answers with today's blocks, habits and tasks
 * together for exactly this reason.
 */
final class TodayClient {
    private static final String TAG = "OntoplanoWidget";
    private static final int TIMEOUT_MS = 10000;

    private TodayClient() {}

    /** What the list adapter draws: a flat list, because RemoteViews has no sections. */
    static final class Row {
        static final int KIND_HEADING = 0;
        static final int KIND_ITEM = 1;

        final int kind;
        final String lead;
        final String title;
        final String trail;
        final boolean dimmed;

        Row(int kind, String lead, String title, String trail, boolean dimmed) {
            this.kind = kind;
            this.lead = lead;
            this.title = title;
            this.trail = trail;
            this.dimmed = dimmed;
        }

        static Row heading(String text) {
            return new Row(KIND_HEADING, "", text, "", false);
        }
    }

    static final class Result {
        final List<Row> rows;
        /** Null when the fetch worked; a short sentence to show when it did not. */
        final String error;

        Result(List<Row> rows, String error) {
            this.rows = rows;
            this.error = error;
        }
    }

    static Result fetch(Context context) {
        if (!WidgetSettings.configured(context)) {
            return new Result(new ArrayList<Row>(), context.getString(R.string.widget_not_configured));
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL(WidgetSettings.origin(context) + "/api/v1/today");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Authorization", "Bearer " + WidgetSettings.token(context));
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);

            int status = connection.getResponseCode();
            if (status == 401 || status == 403) {
                return new Result(new ArrayList<Row>(), context.getString(R.string.widget_bad_token));
            }
            if (status != 200) {
                return new Result(new ArrayList<Row>(), context.getString(R.string.widget_unreachable));
            }

            return new Result(parse(context, new JSONObject(read(connection.getInputStream()))), null);
        } catch (IOException | org.json.JSONException e) {
            Log.w(TAG, "today fetch failed", e);
            return new Result(new ArrayList<Row>(), context.getString(R.string.widget_unreachable));
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    private static String read(InputStream stream) throws IOException {
        StringBuilder out = new StringBuilder();
        BufferedReader reader =
                new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8));
        try {
            String line;
            while ((line = reader.readLine()) != null) {
                out.append(line);
            }
        } finally {
            reader.close();
        }
        return out.toString();
    }

    private static List<Row> parse(Context context, JSONObject body) {
        List<Row> rows = new ArrayList<>();

        JSONArray blocks = body.optJSONArray("blocks");
        if (blocks != null && blocks.length() > 0) {
            rows.add(Row.heading(context.getString(R.string.widget_blocks)));
            for (int i = 0; i < blocks.length(); i++) {
                JSONObject block = blocks.optJSONObject(i);
                if (block == null) {
                    continue;
                }
                String status = block.optString("status", "todo");
                boolean closed = "done".equals(status) || "skipped".equals(status);
                rows.add(new Row(
                        Row.KIND_ITEM,
                        block.optString("start_time", ""),
                        block.optString("title", ""),
                        closed ? context.getString(R.string.widget_done_mark) : "",
                        closed));
            }
        }

        JSONArray habits = body.optJSONArray("habits");
        if (habits != null && habits.length() > 0) {
            rows.add(Row.heading(context.getString(R.string.widget_habits)));
            for (int i = 0; i < habits.length(); i++) {
                JSONObject habit = habits.optJSONObject(i);
                if (habit == null) {
                    continue;
                }
                boolean done = habit.optBoolean("done", false);
                int streak = habit.optInt("streak", 0);
                rows.add(new Row(
                        Row.KIND_ITEM,
                        done ? context.getString(R.string.widget_done_mark) : "·",
                        habit.optString("name", ""),
                        streak > 0 ? context.getString(R.string.widget_streak, streak) : "",
                        done));
            }
        }

        JSONArray tasks = body.optJSONArray("tasks");
        if (tasks != null && tasks.length() > 0) {
            rows.add(Row.heading(context.getString(R.string.widget_tasks)));
            for (int i = 0; i < tasks.length(); i++) {
                JSONObject task = tasks.optJSONObject(i);
                if (task == null) {
                    continue;
                }
                rows.add(new Row(
                        Row.KIND_ITEM,
                        "·",
                        task.optString("title", ""),
                        task.optBoolean("overdue", false)
                                ? context.getString(R.string.widget_overdue)
                                : "",
                        false));
            }
        }

        return rows;
    }
}
