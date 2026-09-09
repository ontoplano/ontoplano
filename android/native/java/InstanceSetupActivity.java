package __PACKAGE__;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Which ontoplano this app talks to.
 *
 * Asked once, on first run, and reachable afterwards from the launcher icon's
 * long-press menu — the app itself is a web view, so a native question needs a
 * native way back to it.
 *
 * There are two answers and they are not equal: most people want the instance
 * this build was made for, and that is the button. Somebody self-hosting types
 * an address, which is the whole reason this screen exists — a build bound to
 * one origin forever is a client for one company's service, and this app is
 * not that.
 *
 * The address is checked before it is kept. A typo here does not fail until
 * the app opens on a blank page, which is a long way from the mistake.
 */
public class InstanceSetupActivity extends Activity {
    /** The origin this build was generated against, offered as the easy answer. */
    private static final String BUILT_FOR = "__ORIGIN__";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private EditText address;
    private TextView status;
    private Button use;
    private Button mine;
    private Button forget;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.instance_setup);

        address = findViewById(R.id.instance_address);
        status = findViewById(R.id.instance_status);
        use = findViewById(R.id.instance_use_default);
        mine = findViewById(R.id.instance_use_mine);
        forget = findViewById(R.id.instance_forget);

        String current = Instance.origin(this);
        address.setText(current.isEmpty() ? BUILT_FOR : current);

        use.setText(getString(R.string.instance_use_default, host(BUILT_FOR)));
        use.setOnClickListener(v -> choose(BUILT_FOR));
        mine.setOnClickListener(v -> choose(address.getText().toString()));

        // Only once there is something to leave. On first run there is no
        // "forget", and a button that does nothing is worse than no button.
        forget.setVisibility(current.isEmpty() ? View.GONE : View.VISIBLE);
        forget.setOnClickListener(v -> {
            Instance.forget(this);
            finish();
        });
    }

    @Override
    protected void onDestroy() {
        worker.shutdownNow();
        super.onDestroy();
    }

    /** Just the host, so a button reads "Use app.ontoplano.com". */
    private static String host(String origin) {
        String parsed = Uri.parse(origin).getHost();
        return parsed == null ? origin : parsed;
    }

    private void busy(boolean on, String message) {
        use.setEnabled(!on);
        mine.setEnabled(!on);
        status.setText(message);
    }

    private void choose(String typed) {
        String origin = Instance.tidy(typed);
        if (!Instance.usable(origin)) {
            status.setText(R.string.instance_bad_address);
            return;
        }

        busy(true, getString(R.string.instance_checking));
        worker.execute(() -> {
            boolean reachable = answers(origin);
            main.post(() -> {
                if (isFinishing() || isDestroyed()) return;
                if (!reachable) {
                    busy(false, getString(R.string.instance_no_answer));
                    return;
                }
                Instance.saveOrigin(this, origin);
                startActivity(new Intent(this, LauncherActivity.class));
                finish();
            });
        });
    }

    /**
     * Whether an ontoplano is listening there.
     *
     * `/healthz` answers without a session and touches the database, so it
     * separates "wrong address" from "right address, server asleep" — which
     * are different problems and only one of them is this screen's.
     */
    private static boolean answers(String origin) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(origin + "/healthz").openConnection();
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setRequestMethod("GET");
            return connection.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }
}
