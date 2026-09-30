package com.mittohoa.xaxi_wallet;

import android.app.DatePickerDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import android.graphics.Color;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;

import androidx.core.content.FileProvider;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.io.File;
import java.io.FileOutputStream;
import java.util.Calendar;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Nhung manh native lam cho lop web bot giong trang web.
 *
 * Bon viec:
 *   - rung phan hoi khi ghi xong mot khoan
 *   - thanh trang thai va thanh dieu huong doi mau theo chu de sang/toi
 *   - bo chon ngay cua he dieu hanh
 *   - lay van ban nguoi dung chia se toi app
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
     * Mo bo chon ngay CUA HE DIEU HANH thay vi <input type="date"> cua web.
     *
     * Day la cho khac biet ro nhat giua app va trang web: bo chon cua web tren
     * Android la mot o be ti voi ba o so, con bo chon he thong la lich thang
     * quen thuoc, vuot chuyen thang duoc, va ton trong dinh dang ngay cua may.
     *
     * Tra ve chuoi 'YYYY-MM-DD', hoac cancelled=true neu nguoi dung bo qua.
     */
    @PluginMethod
    public void pickDate(PluginCall call) {
        String initial = call.getString("date");
        Calendar calendar = Calendar.getInstance();
        if (initial != null && initial.length() >= 10) {
            try {
                calendar.set(
                    Integer.parseInt(initial.substring(0, 4)),
                    Integer.parseInt(initial.substring(5, 7)) - 1,
                    Integer.parseInt(initial.substring(8, 10))
                );
            } catch (NumberFormatException e) {
                // Ngay khong doc duoc thi mo o hom nay, khong phai loi dang bao
            }
        }

        call.setKeepAlive(true);
        bridge.saveCall(call);

        getActivity().runOnUiThread(() -> {
            DatePickerDialog dialog = new DatePickerDialog(
                getActivity(),
                (view, year, month, day) -> {
                    JSObject result = new JSObject();
                    result.put("date", String.format(java.util.Locale.US, "%04d-%02d-%02d", year, month + 1, day));
                    result.put("cancelled", false);
                    call.resolve(result);
                    bridge.releaseCall(call);
                },
                calendar.get(Calendar.YEAR),
                calendar.get(Calendar.MONTH),
                calendar.get(Calendar.DAY_OF_MONTH)
            );

            // Bo qua cung phai tra ve, khong thi lop web cho mai
            dialog.setOnCancelListener(d -> {
                JSObject result = new JSObject();
                result.put("cancelled", true);
                call.resolve(result);
                bridge.releaseCall(call);
            });

            // Khong cho chon ngay tuong lai qua xa: ghi chi tieu cho nam sau la vo nghia
            Calendar limit = Calendar.getInstance();
            limit.add(Calendar.YEAR, 1);
            dialog.getDatePicker().setMaxDate(limit.getTimeInMillis());

            dialog.show();
        });
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

            /*
             * Tu API 35 (edge-to-edge bat buoc), setStatusBarColor va
             * setNavigationBarColor la HAM RONG — he dieu hanh khong con cho app
             * to thanh he thong nua, noi dung web hien thang qua duoi do.
             *
             * Van goi cho may cu (API 34 tro xuong) van dung duoc.
             */
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);

            /*
             * Khong con to duoc thanh he thong thi MAU BIEU TUONG tren no la thu
             * duy nhat con dieu khien duoc — va no thanh bat buoc.
             *
             * Do tren may ao Android 17: nen sang ma bieu tuong van trang, tuc
             * gio, song, pin BIEN MAT hoan toan. Nguoi dung mat dong ho va vach
             * pin ngay khi mo app.
             *
             * Phai bao he dieu hanh rang app tu lo phan long khung TRUOC, roi moi
             * lay bo dieu khien qua WindowCompat. Dung `new
             * WindowInsetsControllerCompat(...)` truc tiep thi tren API moi no
             * khong gan vao dung cua so.
             */
            WindowCompat.setDecorFitsSystemWindows(window, false);
            WindowInsetsControllerCompat controller =
                WindowCompat.getInsetsController(window, window.getDecorView());
            controller.setAppearanceLightStatusBars(!dark);
            controller.setAppearanceLightNavigationBars(!dark);
        });

        JSObject result = new JSObject();
        result.put("applied", true);
        call.resolve(result);
    }

    /**
     * Lay van ban nguoi dung vua chia se toi app, va xoa no di.
     *
     * Xoa ngay sau khi tra la co y: khong thi mo app lan sau se lai bat ra o
     * dan bien lai voi doan tin nhan cu — dung loi ma phien ban truoc mac phai
     * o duong URL.
     */
    @PluginMethod
    public void consumeSharedText(PluginCall call) {
        JSObject result = new JSObject();
        result.put("text", MainActivity.pendingSharedText == null ? "" : MainActivity.pendingSharedText);
        MainActivity.pendingSharedText = null;
        call.resolve(result);
    }

    /**
     * Lop web bao xuong rang no dang mo mot tam truot chiem man hinh.
     *
     * Nho co no ma nut Back dong tam truot thay vi dong app, ma van thoat app
     * duoc khi dang o man hinh chinh.
     */
    @PluginMethod
    public void setOverlayOpen(PluginCall call) {
        MainActivity.overlayOpen = Boolean.TRUE.equals(call.getBoolean("open", false));
        call.resolve();
    }

    /** Thu muc tam cho tep xuat ra; nam trong vung rieng cua app */
    private static final String EXPORT_DIR = "xuat";

    /**
     * Ghi mot tep roi mo bang Chia se de nguoi dung tu chon noi luu.
     *
     * Vi sao phai co: lop web tai tep bang the <a download> tro toi blob URL.
     * Cach do dung tren trinh duyet, nhung WebView cua Android KHONG xu ly no —
     * khong co tep nao duoc tao, ma lop web van tuong da xong va bao "da xuat
     * ban sao luu". Nguoi dung tin la minh co ban sao luu, thuc ra khong co gi.
     *
     * Chon bang Chia se thay vi ghi thang vao thu muc Tai xuong: khong can quyen
     * nao o bat ky phien ban Android nao, va nguoi dung tu quyet dinh du lieu tai
     * chinh cua minh di dau.
     */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("name", "xaxi-export");
        String mime = call.getString("mimeType", "application/octet-stream");
        String data = call.getString("data");
        if (data == null) {
            call.reject("Thiếu nội dung tệp.");
            return;
        }

        try {
            File dir = new File(getContext().getCacheDir(), EXPORT_DIR);
            if (!dir.exists() && !dir.mkdirs()) {
                call.reject("Không tạo được thư mục tạm.");
                return;
            }

            // Don ban xuat truoc do: day la du lieu tai chinh, khong de no nam lai
            // trong bo nho dem lau hon muc can thiet. Ban cu chac chan da duoc doc
            // xong vi nguoi dung da di qua bang Chia se roi.
            File[] cu = dir.listFiles();
            if (cu != null) {
                for (File f : cu) f.delete();
            }

            File out = new File(dir, name);
            FileOutputStream stream = new FileOutputStream(out);
            try {
                stream.write(Base64.decode(data, Base64.DEFAULT));
            } finally {
                stream.close();
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                out
            );

            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_TITLE, name);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(send, name);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);

            JSObject result = new JSObject();
            result.put("shared", true);
            result.put("bytes", out.length());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Không lưu được tệp: " + e.getMessage());
        }
    }

    /**
     * Ghi ban tom tat cho tien ich man hinh chinh.
     *
     * Widget chay trong tien trinh cua launcher va KHONG doc duoc IndexedDB cua
     * WebView. Nen lop web phai ghi san vai con so ra SharedPreferences moi lan
     * du lieu doi; widget chi doc lai. Mot noi ghi, mot noi doc — ban tom tat co
     * the cu vai giay nhung khong bao gio mau thuan.
     *
     * Chi nhan CHUOI DA DINH DANG san. Dinh dang tien te nam o lop web (locale,
     * don vi, dau phan cach); lam lai o day la co hai cho cung dinh dang mot thu
     * va som muon chung lech nhau.
     */
    @PluginMethod
    public void updateWidget(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(XaxiWidget.PREFS, Context.MODE_PRIVATE);
        prefs
            .edit()
            .putString(XaxiWidget.KEY_TODAY, call.getString("today", "—"))
            .putString(XaxiWidget.KEY_MONTH, call.getString("month", ""))
            .putString(XaxiWidget.KEY_MONTH_LABEL, call.getString("monthLabel", ""))
            .putString(XaxiWidget.KEY_HINT, call.getString("hint", ""))
            .apply();

        XaxiWidget.refresh(getContext());
        call.resolve();
    }

    /**
     * Nguoi dung vao app tu nut "Ghi nhanh" tren widget hay khong.
     *
     * Xoa co ngay sau khi tra ve: khong thi moi lan mo app sau do deu bat ban
     * phim len, ke ca khi nguoi dung chi muon xem bao cao.
     */
    @PluginMethod
    public void consumeQuickIntent(PluginCall call) {
        JSObject result = new JSObject();
        result.put("quick", MainActivity.pendingQuick);
        MainActivity.pendingQuick = false;
        call.resolve(result);
    }
}
