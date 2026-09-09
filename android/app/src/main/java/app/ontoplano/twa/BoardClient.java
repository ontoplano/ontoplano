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
 * Today, as numbers rather than rows.
 *
 * `TodayClient` turns the same endpoint into a scrollable list. The drawn
 * widgets do not want a list — they want what is on now, how much of the day
 * is behind you, and how many of each thing are done. One request, like the
 * list's, because a widget on mobile data gets one chance to be right.
 */
final class BoardClient {
    private static final String TAG = "OntoplanoWidget";
    private static final int TIMEOUT_MS = 10000;

    private BoardClient() {}

    /** One block of the day, with only what a drawing needs. */
    static final class Block {
        final String title;
        final String startTime;
        final int minutes;
        final String category;
        final boolean done;
        /** Minutes from midnight, for placing it on a bar. */
        final int startsAt;

        Block(String title, String startTime, int minutes, String category, boolean done) {
            this.title = title;
            this.startTime = startTime;
            this.minutes = minutes;
            this.category = category;
            this.done = done;
            this.startsAt = minutesOf(startTime);
        }
    }

    static final class Board {
        final List<Block> blocks = new ArrayList<>();
        int habitsDone;
        int habitsTotal;
        int tasksDone;
        int tasksTotal;
        /** Null when the fetch worked; a short sentence when it did not. */
        String error;
    }

    static int minutesOf(String hhmm) {
        try {
            return Integer.parseInt(hhmm.substring(0, 2)) * 60 + Integer.parseInt(hhmm.substring(3, 5));
        } catch (Exception e) {
            return 0;
        }
    }

    static Board load(Context context) {
        Board board = new Board();

        if (!Instance.configured(context)) {
            board.error = context.getString(R.string.widget_not_configured);
            return board;
        }

        HttpURLConnection connection = null;
        try {
            URL url = new URL(Instance.origin(context) + "/api/v1/today");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestProperty("Authorization", "Bearer " + Instance.token(context));
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);

            int status = connection.getResponseCode();
            if (status == 401 || status == 403) {
                board.error = context.getString(R.string.widget_bad_token);
                return board;
            }
            if (status != 200) {
                board.error = context.getString(R.string.widget_unreachable);
                return board;
            }

            JSONObject json = new JSONObject(read(connection.getInputStream()));

            JSONArray blocks = json.optJSONArray("blocks");
            for (int i = 0; blocks != null && i < blocks.length(); i++) {
                JSONObject block = blocks.getJSONObject(i);
                board.blocks.add(new Block(
                        block.optString("title", ""),
                        block.optString("start_time", "00:00"),
                        block.optInt("duration_minutes", 0),
                        block.isNull("category") ? null : block.optString("category"),
                        "done".equals(block.optString("status"))));
            }

            JSONArray habits = json.optJSONArray("habits");
            for (int i = 0; habits != null && i < habits.length(); i++) {
                board.habitsTotal++;
                if (habits.getJSONObject(i).optBoolean("done")) board.habitsDone++;
            }

            JSONArray tasks = json.optJSONArray("tasks");
            for (int i = 0; tasks != null && i < tasks.length(); i++) {
                board.tasksTotal++;
                if ("done".equals(tasks.getJSONObject(i).optString("status"))) board.tasksDone++;
            }
        } catch (IOException e) {
            Log.w(TAG, "widget could not reach the instance", e);
            board.error = context.getString(R.string.widget_unreachable);
        } catch (Exception e) {
            Log.w(TAG, "widget could not read the answer", e);
            board.error = context.getString(R.string.widget_unreachable);
        } finally {
            if (connection != null) connection.disconnect();
        }

        return board;
    }

    private static String read(InputStream stream) throws IOException {
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader =
                     new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
        }
        return out.toString();
    }
}
