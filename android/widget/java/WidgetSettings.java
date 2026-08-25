package __PACKAGE__;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Where the widget keeps the instance it talks to.
 *
 * One origin and one token for the whole app rather than one per widget: a
 * person self-hosting has exactly one instance, and asking them to paste a
 * token again for a second widget would be a worse answer to a problem they do
 * not have.
 */
final class WidgetSettings {
    private static final String FILE = "ontoplano_widget";
    private static final String KEY_ORIGIN = "origin";
    private static final String KEY_TOKEN = "token";

    private WidgetSettings() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    static String origin(Context context) {
        return prefs(context).getString(KEY_ORIGIN, "");
    }

    static String token(Context context) {
        return prefs(context).getString(KEY_TOKEN, "");
    }

    static boolean configured(Context context) {
        return !origin(context).isEmpty() && !token(context).isEmpty();
    }

    static void save(Context context, String origin, String token) {
        // A trailing slash is the ordinary way to paste an address, and
        // "https://x//api/v1/today" is not a URL anybody meant to type.
        String trimmed = origin.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }

        prefs(context).edit()
                .putString(KEY_ORIGIN, trimmed)
                .putString(KEY_TOKEN, token.trim())
                .apply();
    }
}
