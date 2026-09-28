package app.ontoplano.isolated;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * What one notebook widget knows, and the one question it asks.
 *
 * The phone keeps a key per widget and nothing else of consequence: which
 * notebook, which tab, filtered and ordered how — all of that is kept on the
 * instance, so it can be changed from Settings and the widget draws the new
 * answer on its next refresh. What is written here besides the key is only
 * the last header it drew, so the header survives a launcher restart.
 */
final class NotebookWidgetClient {
    private static final String TAG = "OntoplanoWidget";
    private static final String FILE = "ontoplano_notebook_widgets";
    private static final String ENDPOINT = "/api/v1/widget";
    private static final int TIMEOUT_MS = 10000;

    private static final String ORIGIN = "origin.";
    private static final String TOKEN = "token.";
    private static final String WIDGET = "widget.";
    private static final String TITLE = "title.";
    private static final String SECTION = "section.";
    private static final String HREF = "href.";

    private NotebookWidgetClient() {}

    /** One line of the list. */
    static final class Item {
        final String title;
        final String detail;
        final boolean done;
        final String href;

        Item(String title, String detail, boolean done, String href) {
            this.title = title;
            this.detail = detail;
            this.done = done;
            this.href = href;
        }
    }

    /** An answer: the lines, or why there are none. */
    static final class Result {
        final List<Item> items;
        /** Null when it worked; otherwise one of the TROUBLE_ values. */
        final String trouble;

        Result(List<Item> items, String trouble) {
            this.items = items;
            this.trouble = trouble;
        }
    }

    static final String TROUBLE_UNBOUND = "unbound";
    static final String TROUBLE_REFUSED = "refused";
    static final String TROUBLE_UNREACHABLE = "unreachable";

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    /** Hand widget `slot` its key, from the page that minted it. */
    static void bind(Context context, int slot, String origin, String token, int widget) {
        prefs(context)
                .edit()
                .putString(ORIGIN + slot, origin)
                .putString(TOKEN + slot, token)
                .putInt(WIDGET + slot, widget)
                .remove(TITLE + slot)
                .remove(SECTION + slot)
                .remove(HREF + slot)
                .apply();
    }

    static void forget(Context context, int slot) {
        prefs(context)
                .edit()
                .remove(ORIGIN + slot)
                .remove(TOKEN + slot)
                .remove(WIDGET + slot)
                .remove(TITLE + slot)
                .remove(SECTION + slot)
                .remove(HREF + slot)
                .apply();
    }

    static boolean bound(Context context, int slot) {
        return !prefs(context).getString(TOKEN + slot, "").isEmpty();
    }

    static String origin(Context context, int slot) {
        return prefs(context).getString(ORIGIN + slot, "");
    }

    /** The widget's row on the instance, or 0 for one never set up. */
    static int widget(Context context, int slot) {
        return prefs(context).getInt(WIDGET + slot, 0);
    }

    static String title(Context context, int slot) {
        return prefs(context).getString(TITLE + slot, "");
    }

    static String section(Context context, int slot) {
        return prefs(context).getString(SECTION + slot, "");
    }

    /** The notebook tab the header opens, as a path on the instance. */
    static String href(Context context, int slot) {
        return prefs(context).getString(HREF + slot, "");
    }

    /** Ask the instance. Off the main thread: it is a network call. */
    static Result fetch(Context context, int slot) {
        String origin = origin(context, slot);
        String token = prefs(context).getString(TOKEN + slot, "");
        if (origin.isEmpty() || token.isEmpty()) return new Result(new ArrayList<>(), TROUBLE_UNBOUND);

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(origin + ENDPOINT).openConnection();
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);

            int status = connection.getResponseCode();
            // Revoked, deleted from Settings, or the notebook is gone: the key
            // is kept, so setting the widget up again can say which one it was.
            if (status == 401 || status == 403 || status == 404)
                return new Result(new ArrayList<>(), TROUBLE_REFUSED);
            if (status != 200) return new Result(new ArrayList<>(), TROUBLE_UNREACHABLE);

            JSONObject body = new JSONObject(read(connection));
            prefs(context)
                    .edit()
                    .putString(TITLE + slot, body.getJSONObject("notebook").optString("title", ""))
                    .putString(SECTION + slot, body.optString("section", ""))
                    .putString(HREF + slot, body.optString("href", ""))
                    .apply();

            JSONArray lines = body.getJSONArray("items");
            List<Item> items = new ArrayList<>();
            for (int i = 0; i < lines.length(); i++) {
                JSONObject one = lines.getJSONObject(i);
                items.add(
                        new Item(
                                one.optString("title", ""),
                                one.isNull("detail") ? "" : one.optString("detail", ""),
                                one.optBoolean("done", false),
                                one.optString("href", "")));
            }
            return new Result(items, null);
        } catch (IOException | JSONException e) {
            Log.w(TAG, "could not read the widget", e);
            return new Result(new ArrayList<>(), TROUBLE_UNREACHABLE);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(HttpURLConnection connection) throws IOException {
        StringBuilder out = new StringBuilder();
        try (BufferedReader reader =
                new BufferedReader(
                        new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) out.append(line);
        }
        return out.toString();
    }
}
