package app.ontoplano.twa;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;

/**
 * Which instance this install talks to.
 *
 * One origin for the whole app rather than one per widget: a person
 * self-hosting has exactly one instance, and asking them to paste a token
 * again for a second widget would be a worse answer to a problem they do not
 * have. The app proper reads the same origin, so choosing one on first run
 * points the widgets at it too.
 *
 * The token belongs to the widgets alone. They talk to the API directly and
 * need a key of their own; the app is a browser and carries a session.
 */
final class Instance {
    private static final String FILE = "ontoplano_widget";
    private static final String KEY_ORIGIN = "origin";
    private static final String KEY_TOKEN = "token";

    private Instance() {}

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

    /** The address alone, which is all the app itself needs. */
    static void saveOrigin(Context context, String origin) {
        prefs(context).edit().putString(KEY_ORIGIN, tidy(origin)).apply();
    }

    /**
     * Back to knowing nothing, which sends the app to the first-run question.
     *
     * The token goes with it. A key minted by one instance means nothing to
     * another, and leaving it behind would have the widgets quietly asking a
     * new host for a stranger's day.
     */
    static void forget(Context context) {
        prefs(context).edit().remove(KEY_ORIGIN).remove(KEY_TOKEN).apply();
    }

    /**
     * The same link, aimed at the chosen instance.
     *
     * A TWA is generated pointing at one origin, and every URL the launcher
     * hands us — the start URL, a deep link into a particular day — carries
     * that host. Swapping the scheme, host and port keeps the path and query,
     * so a link to a Tuesday still opens that Tuesday.
     */
    static Uri rebase(Context context, Uri uri) {
        String chosen = origin(context);
        if (chosen.isEmpty() || uri == null) return uri;

        Uri base = Uri.parse(chosen);
        if (base.getHost() == null) return uri;

        return uri.buildUpon()
                .scheme(base.getScheme())
                .encodedAuthority(base.getEncodedAuthority())
                .build();
    }

    /** An address somebody could have meant: a scheme we speak and a host. */
    static boolean usable(String origin) {
        Uri uri = Uri.parse(tidy(origin));
        String scheme = uri.getScheme();
        return uri.getHost() != null
                && !uri.getHost().isEmpty()
                && ("http".equals(scheme) || "https".equals(scheme));
    }

    static String tidy(String origin) {
        String trimmed = origin.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }

    static void save(Context context, String origin, String token) {
        // A trailing slash is the ordinary way to paste an address, and
        // "https://x//api/v1/today" is not a URL anybody meant to type.
        prefs(context).edit()
                .putString(KEY_ORIGIN, tidy(origin))
                .putString(KEY_TOKEN, token.trim())
                .apply();
    }
}
