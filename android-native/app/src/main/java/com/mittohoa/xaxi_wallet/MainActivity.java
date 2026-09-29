package com.mittohoa.xaxi_wallet;

import android.content.Intent;
import android.os.Bundle;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * Dang ky cac plugin tu viet. Tep nay ghi de ban do Capacitor sinh ra,
 * duoc chep vao moi lan dong bo boi scripts/sync-native.mjs.
 *
 * Ngoai ra con nhan van ban nguoi dung CHIA SE toi app. Manifest khai bao
 * intent-filter ACTION_SEND, nhung Capacitor khong tu chuyen noi dung intent
 * sang lop web — khong co doan duoi day thi XAXI van hien trong menu Chia se,
 * van mo len, roi im lang vut mat doan tin nhan bien dong so du.
 */
public class MainActivity extends BridgeActivity {

    /**
     * Van ban dang cho lop web den lay.
     *
     * Tinh (static) vi intent toi TRUOC khi WebView san sang o lan mo dau tien:
     * luc onCreate chay thi chua co gi ben JS de goi toi. Giu lai o day, JS hoi
     * khi no dung day.
     */
    static String pendingSharedText = null;

    /**
     * Lop web dang mo mot tam truot chiem man hinh hay khong.
     *
     * Do chinh lop web bao xuong qua ShellPlugin.setOverlayOpen().
     */
    static boolean overlayOpen = false;

    /** Nguoi dung vao app tu nut "Ghi nhanh" tren tien ich man hinh chinh */
    static boolean pendingQuick = false;

    /**
     * Nut Back cua Android.
     *
     * Phai tu lam: loi Capacitor 6 KHONG dong toi nut Back — viec do nam o
     * plugin @capacitor/app ma du an nay khong cai. Khong co doan nay thi Back
     * roi thang ve hanh vi mac dinh cua Activity la dong app, va lop web khong
     * bao gio thay su kien nao. Cach cu (history.pushState + popstate) chi dung
     * tren trinh duyet, noi trinh duyet so huu cu chi Back.
     */
    private final OnBackPressedCallback backCallback = new OnBackPressedCallback(true) {
        @Override
        public void handleOnBackPressed() {
            if (overlayOpen && getBridge() != null) {
                getBridge().triggerWindowJSEvent("xaxiBack");
                return;
            }
            // Khong co gi de dong thi tra lai hanh vi mac dinh: thoat app
            setEnabled(false);
            getOnBackPressedDispatcher().onBackPressed();
            setEnabled(true);
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(OcrPlugin.class);
        registerPlugin(VoicePlugin.class);
        registerPlugin(ShellPlugin.class);
        super.onCreate(savedInstanceState);
        captureSharedText(getIntent());
        captureQuick(getIntent());
        // Dang ky sau super de nam tren cung chuoi xu ly Back
        getOnBackPressedDispatcher().addCallback(this, backCallback);
    }

    /**
     * App dang chay san thi Android khong tao Activity moi (launchMode singleTask)
     * ma goi vao day. Thieu ham nay thi chia se lan thu hai tro di khong an gi.
     */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (captureQuick(intent) && getBridge() != null) {
            getBridge().triggerWindowJSEvent("xaxiQuick");
        }
        if (captureSharedText(intent) && getBridge() != null) {
            // Lop web dang song: bao cho no biet co van ban moi, khong phai doi
            getBridge().triggerWindowJSEvent("xaxiSharedText");
        }
    }

    /** Chi nhan van ban thuan; moi thu khac bo qua chu khong doan mo */
    private boolean captureSharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return false;
        CharSequence text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
        if (text == null || text.length() == 0) return false;
        pendingSharedText = text.toString();
        return true;
    }

    /** Co bao nguoi dung muon ghi ngay, dat tu tien ich man hinh chinh */
    private boolean captureQuick(Intent intent) {
        if (intent == null || !intent.getBooleanExtra(XaxiWidget.EXTRA_QUICK, false)) return false;
        pendingQuick = true;
        // Xoa khoi intent: Android giu lai intent cu, nen khong xoa thi lan mo
        // app tiep theo tu danh sach gan day cung bi coi la "ghi nhanh".
        intent.removeExtra(XaxiWidget.EXTRA_QUICK);
        return true;
    }
}
