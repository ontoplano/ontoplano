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
 * long-press menu and from the account page inside the app — which opens
 * `ontoplano://instance`, since a web page cannot start an activity on its own.
 *
 * There are three answers and they are not equal. Most people want the
 * instance this build was made for, and that is the filled button. Somebody
 * who has not decided yet wants a look first, which is the demo — offered only
 * by a build pointed at the instance that runs one. Somebody self-hosting
 * types an address, which is the whole reason this screen exists: a build
 * bound to one origin forever is a client for one company's service, and this
 * app is not that.
 *
 * The address is checked before it is kept. A typo here does not fail until
 * the app opens on a blank page, which is a long way from the mistake.
 */
public class InstanceSetupActivity extends Activity {
    /** The origin this build was generated against, offered as the easy answer. */
    private static final String BUILT_FOR = "__ORIGIN__";

    /**
     * Somewhere to look before choosing, or empty.
     *
     * The build fills this in only for the instance that actually runs a demo.
     * A copy somebody built against their own server has no business sending
     * them to ours, so on those builds the button is not drawn at all.
     */
    private static final String DEMO = "__DEMO__";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    private EditText address;
    private TextView status;
    private Button use;
    private Button demo;
    private Button mine;
    private Button forget;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.instance_setup);

        address = findViewById(R.id.instance_address);
        status = findViewById(R.id.instance_status);
        use = findViewById(R.id.instance_use_default);
        demo = findViewById(R.id.instance_use_demo);
        mine = findViewById(R.id.instance_use_mine);
        forget = findViewById(R.id.instance_forget);
        TextView current = findViewById(R.id.instance_current);

        String chosen = Instance.origin(this);

        // Empty unless there is an address worth editing. Prefilling the box
        // with the instance the button above already offers makes the two read
        // as the same answer typed twice.
        if (!chosen.isEmpty() && !chosen.equals(BUILT_FOR)) address.setText(chosen);

        // The label is the choice; the address it means is said in the line above,
        // because "Official instance" is what somebody is picking between and
        // a hostname is what they check afterwards.
        use.setOnClickListener(v -> choose(BUILT_FOR));
        ((TextView) findViewById(R.id.instance_help))
                .setText(getString(R.string.instance_help, host(BUILT_FOR)));
        mine.setOnClickListener(v -> choose(address.getText().toString()));

        demo.setVisibility(DEMO.isEmpty() ? View.GONE : View.VISIBLE);
        demo.setOnClickListener(v -> choose(DEMO));

        // Both only once there is something to leave. On first run there is no
        // "forget", and a button that does nothing is worse than no button.
        int already = chosen.isEmpty() ? View.GONE : View.VISIBLE;
        current.setVisibility(already);
        forget.setVisibility(already);
        current.setText(getString(R.string.instance_current, host(chosen)));
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
        demo.setEnabled(!on);
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
