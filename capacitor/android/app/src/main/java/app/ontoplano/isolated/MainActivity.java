package app.ontoplano.isolated;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Before super, which is where the bridge is built: a plugin registered
        // afterwards is not in the bridge the web view is handed.
        registerPlugin(OntoplanoSettings.class);
        super.onCreate(savedInstanceState);
    }
}
