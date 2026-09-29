package app.xaxi.wallet;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

/**
 * Dang ky cac plugin tu viet. Tep nay ghi de ban do Capacitor sinh ra,
 * duoc chep vao moi lan dong bo boi scripts/sync-native.mjs.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OcrPlugin.class);
        registerPlugin(VoicePlugin.class);
        registerPlugin(ShellPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
