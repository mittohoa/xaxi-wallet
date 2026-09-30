package com.mittohoa.xaxi_wallet;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.net.Uri;
import android.util.Log;
import java.io.InputStream;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Doc chu tu anh bang ML Kit — chay hoan toan tren may.
 *
 * Ba diem thiet ke quan trong:
 *
 *  1. Plugin nay KHONG mo camera va KHONG xin quyen CAMERA. Anh do lop web gui
 *     xuong (qua <input type="file" capture>), tuc la app camera cua he thong
 *     chup ho. App cua ta khong bao gio cham vao camera.
 *
 *  2. Dung ban play-services-mlkit-text-recognition (unbundled): mo hinh do
 *     Google Play Services tai ve sau khi cai app, nen APK khong phinh them.
 *
 *  3. Anh va chu deu chi nam trong bo nho tien trinh, khong ghi ra dia,
 *     khong gui di dau.
 */
@CapacitorPlugin(name = "Ocr")
public class OcrPlugin extends Plugin {

    @PluginMethod
    public void recognize(PluginCall call) {
        String image = call.getString("image");
        if (image == null || image.isEmpty()) {
            call.reject("Thiếu dữ liệu ảnh.");
            return;
        }

        // Lop web co the gui kem tien to 'data:image/jpeg;base64,'
        int comma = image.indexOf(',');
        String payload = comma >= 0 ? image.substring(comma + 1) : image;

        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(payload, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            call.reject("Dữ liệu ảnh không hợp lệ.");
            return;
        }

        if (bitmap == null) {
            call.reject("Không đọc được ảnh.");
            return;
        }

        doc(bitmap, call);
    }

    /**
     * Doc chu tu ANH DUOC CHIA SE toi app, va tra ve DUNG PHAN CHU.
     *
     * Anh khong bao gio roi khoi tang native. Duong kia — dua anh sang
     * JavaScript roi gui nguoc xuong — phai ma hoa base64 hai luot cho mot tam
     * anh chup man hinh co 2 MB; o day chi vai tram byte chu di qua cau noi.
     */
    @PluginMethod
    public void recognizeShared(PluginCall call) {
        Uri uri = MainActivity.pendingSharedImage;
        MainActivity.pendingSharedImage = null;

        if (uri == null) {
            JSObject rong = new JSObject();
            rong.put("text", "");
            call.resolve(rong);
            return;
        }

        Bitmap bitmap;
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            bitmap = BitmapFactory.decodeStream(in);
        } catch (Exception e) {
            Log.e("XaxiShare", "mo anh that bai", e);
            call.reject("Không mở được ảnh vừa chia sẻ.");
            return;
        }

        if (bitmap == null) {
            call.reject("Không đọc được ảnh vừa chia sẻ.");
            return;
        }

        doc(bitmap, call);
    }

    /** Phan nhan dang dung chung cho ca hai duong vao */
    private void doc(Bitmap bitmap, PluginCall call) {
        TextRecognizer recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
        recognizer
            .process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                JSObject result = new JSObject();
                result.put("text", text.getText());

                /*
                 * Tra ve tung DONG kem TOA DO.
                 *
                 * Tren mot to hoa don, nhan va so nam hai dau mot dong, cach nhau
                 * mot khoang trong rong. ML Kit coi hai cot do la HAI KHOI khac
                 * nhau, nen getText() tra ve tat ca nhan truoc roi moi den tat ca
                 * so — khong dong nao con chua ca "THANH TOAN" lan "187.920".
                 *
                 * Da do tren may that: chup mot to hoa don ra chu doc duoc nhung
                 * khong ra so tien nao. Chi co toa do moi ghep lai duoc.
                 */
                JSArray lines = new JSArray();
                for (Text.TextBlock block : text.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        Rect box = line.getBoundingBox();
                        if (box == null) continue;
                        JSObject item = new JSObject();
                        item.put("text", line.getText());
                        item.put("x", box.left);
                        item.put("y", box.top);
                        item.put("w", box.width());
                        item.put("h", box.height());
                        lines.put(item);
                    }
                }
                result.put("lines", lines);
                call.resolve(result);
                recognizer.close();
                bitmap.recycle();
            })
            .addOnFailureListener(error -> {
                // Lan dau dung co the phai cho Play Services tai mo hinh ve
                call.reject(
                    "Chưa đọc được chữ. Nếu đây là lần đầu dùng, thiết bị cần tải gói nhận dạng chữ qua Google Play "
                        + "Services — hãy bật mạng rồi thử lại sau ít phút. (" + error.getMessage() + ")"
                );
                recognizer.close();
                bitmap.recycle();
            });
    }

    /** Cho lop web biet co dung duoc khong truoc khi hien nut chup */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject result = new JSObject();
        result.put("available", true);
        call.resolve(result);
    }
}
