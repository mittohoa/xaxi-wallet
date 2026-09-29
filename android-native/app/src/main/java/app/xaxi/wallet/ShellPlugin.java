package app.xaxi.wallet;

import android.graphics.Color;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Nhung manh native lam cho lop web bot giong trang web.
 *
 * Hai viec:
 *   - rung phan hoi khi ghi xong mot khoan
 *   - thanh trang thai va thanh dieu huong doi mau theo chu de sang/toi
 *
 * Deu khong xin them quyen nao: VIBRATE la quyen thuong, va o day dung
 * HapticFeedback cua View nen khong can khai bao gi.
 */
@CapacitorPlugin(name = "Shell")
public class ShellPlugin extends Plugin {

    /** Rung ngan, dung cho phan hoi sau mot thao tac thanh cong */
    @PluginMethod
    public void haptic(PluginCall call) {
        String style = call.getString("style", "light");
        getActivity().runOnUiThread(() -> vibrate(style));
        call.resolve();
    }

    private void vibrate(String style) {
        // Uu tien HapticFeedback cua he thong: ton trong thiet lap cua nguoi dung
        View root = getBridge().getWebView();
        if (root != null) {
            int effect = "heavy".equals(style)
                ? (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
                    ? android.view.HapticFeedbackConstants.CONFIRM
                    : android.view.HapticFeedbackConstants.LONG_PRESS)
                : android.view.HapticFeedbackConstants.KEYBOARD_TAP;
            if (root.performHapticFeedback(effect)) return;
        }

        // May khong ho tro thi rung thang, nhung that ngan
        Vibrator vibrator;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) getContext().getSystemService(android.content.Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager == null ? null : manager.getDefaultVibrator();
        } else {
            vibrator = (Vibrator) getContext().getSystemService(android.content.Context.VIBRATOR_SERVICE);
        }
        if (vibrator == null || !vibrator.hasVibrator()) return;

        long ms = "heavy".equals(style) ? 20 : 10;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        } else {
            vibrator.vibrate(ms);
        }
    }

    /**
     * Doi mau thanh he thong theo chu de cua lop web.
     *
     * Khong dung che do tran vien (edge-to-edge): WebView cua Android khong bao
     * cao safe-area-inset cho thanh he thong, chi cho phan khuyet man hinh — nen
     * tran vien se day noi dung xuong duoi thanh trang thai ma CSS khong biet.
     * To mau thanh he thong cho khop nen la cach an toan va cho ket qua tuong tu.
     */
    @PluginMethod
    public void applyTheme(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        String background = call.getString("background", dark ? "#0b0b0d" : "#f3f3f5");

        getActivity().runOnUiThread(() -> {
            Window window = getActivity().getWindow();
            int color;
            try {
                color = Color.parseColor(background);
            } catch (IllegalArgumentException e) {
                color = dark ? Color.parseColor("#0b0b0d") : Color.parseColor("#f3f3f5");
            }

            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);

            // Nen sang thi bieu tuong phai toi, va nguoc lai
            WindowInsetsControllerCompat controller =
                new WindowInsetsControllerCompat(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        });

        JSObject result = new JSObject();
        result.put("applied", true);
        call.resolve(result);
    }
}
