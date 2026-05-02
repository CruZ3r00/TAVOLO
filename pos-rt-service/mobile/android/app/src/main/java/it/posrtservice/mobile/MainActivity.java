package it.posrtservice.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import it.posrtservice.mobile.plugins.NetworkInfoPlugin;
import it.posrtservice.mobile.plugins.PosForegroundServicePlugin;
import it.posrtservice.mobile.plugins.PosTcpSocketPlugin;
import it.posrtservice.mobile.plugins.PosTcpStreamPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PosForegroundServicePlugin.class);
        registerPlugin(PosTcpSocketPlugin.class);
        registerPlugin(PosTcpStreamPlugin.class);
        registerPlugin(NetworkInfoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
