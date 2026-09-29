package app.xaxi.wallet;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Doc chinh ta bang giong noi — de ghi mot khoan luc dang ban tay.
 *
 * Uu tien nhan dang NGAY TREN MAY: EXTRA_PREFER_OFFLINE bao he thong dung goi
 * ngon ngu da tai san thay vi gui am thanh len may chu. Goi tieng Viet do he
 * dieu hanh quan ly (Cai dat > Ngon ngu > Nhan dang giong noi ngoai tuyen),
 * nen app khong phai nhoi them gi vao ban cai.
 *
 * Khong ghi am ra tep. Am thanh chi di qua bo nhan dang cua he thong roi thoi;
 * app chi nhan lai doan chu.
 */
@CapacitorPlugin(
    name = "Voice",
    permissions = { @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = VoicePlugin.MIC) }
)
public class VoicePlugin extends Plugin {

    static final String MIC = "mic";
    private static final String TAG = "XaxiVoice";

    private SpeechRecognizer recognizer;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        if (getPermissionState(MIC) != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias(MIC, call, "micPermissionResult");
            return;
        }
        startListening(call);
    }

    @PermissionCallback
    private void micPermissionResult(PluginCall call) {
        if (getPermissionState(MIC) != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Bạn chưa cho phép dùng micro.");
            return;
        }
        startListening(call);
    }

    private void startListening(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Thiết bị này không có bộ nhận dạng giọng nói.");
            return;
        }

        // Giu lai de tra ve cho lop web khi co ket qua
        call.setKeepAlive(true);
        bridge.saveCall(call);

        getActivity()
            .runOnUiThread(() -> {
                releaseRecognizer();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new Listener(call));

                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("language", "vi-VN"));
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                // Uu tien xu ly tren may de khong gui am thanh ra ngoai
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                    intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true);
                }
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());

                try {
                    recognizer.startListening(intent);
                } catch (SecurityException e) {
                    finish(call, null, "Không truy cập được micro.");
                }
            });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(this::releaseRecognizer);
        call.resolve();
    }

    private void releaseRecognizer() {
        if (recognizer != null) {
            try {
                recognizer.destroy();
            } catch (Exception e) {
                Log.w(TAG, "Không giải phóng được bộ nhận dạng", e);
            }
            recognizer = null;
        }
    }

    private void finish(PluginCall call, String text, String error) {
        getActivity().runOnUiThread(this::releaseRecognizer);
        if (error != null) {
            call.reject(error);
        } else {
            JSObject result = new JSObject();
            result.put("text", text == null ? "" : text);
            call.resolve(result);
        }
        bridge.releaseCall(call);
    }

    /** Doi ma loi cua he thong thanh cau tieng Viet nguoi dung hieu duoc */
    private static String describe(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_NO_MATCH:
                return "Chưa nghe rõ. Thử nói lại gần micro hơn.";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "Không nghe thấy gì.";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "Bạn chưa cho phép dùng micro.";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
                return "Thiết bị chưa có gói nhận dạng tiếng Việt ngoại tuyến. Tải trong Cài đặt của máy, "
                    + "hoặc bật mạng rồi thử lại.";
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
                return "Máy chưa cài gói tiếng Việt cho nhận dạng giọng nói.";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY:
                return "Bộ nhận dạng đang bận, thử lại sau một giây.";
            default:
                return "Không nhận dạng được giọng nói (mã " + code + ").";
        }
    }

    private class Listener implements RecognitionListener {
        private final PluginCall call;
        private boolean done = false;

        Listener(PluginCall call) {
            this.call = call;
        }

        @Override
        public void onResults(Bundle results) {
            if (done) return;
            done = true;
            ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
            String best = matches != null && !matches.isEmpty() ? matches.get(0) : "";

            JSObject payload = new JSObject();
            payload.put("text", best);
            JSArray alternatives = new JSArray();
            if (matches != null) {
                for (String m : matches) alternatives.put(m);
            }
            payload.put("alternatives", alternatives);

            getActivity().runOnUiThread(VoicePlugin.this::releaseRecognizer);
            call.resolve(payload);
            bridge.releaseCall(call);
        }

        @Override
        public void onError(int code) {
            if (done) return;
            done = true;
            finish(call, null, describe(code));
        }

        @Override public void onReadyForSpeech(Bundle params) {}
        @Override public void onBeginningOfSpeech() {}
        @Override public void onRmsChanged(float rms) {}
        @Override public void onBufferReceived(byte[] buffer) {}
        @Override public void onEndOfSpeech() {}
        @Override public void onPartialResults(Bundle partial) {}
        @Override public void onEvent(int type, Bundle params) {}
    }

    @Override
    protected void handleOnDestroy() {
        releaseRecognizer();
        super.handleOnDestroy();
    }

    /** Ngon ngu mac dinh khi lop web khong noi ro */
    @SuppressWarnings("unused")
    private static final Locale DEFAULT_LOCALE = new Locale("vi", "VN");
}
