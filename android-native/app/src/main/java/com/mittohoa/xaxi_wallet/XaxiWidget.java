package com.mittohoa.xaxi_wallet;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * Tien ich man hinh chinh.
 *
 * VAN DE COT LOI: du lieu cua app nam trong IndexedDB cua WebView, va KHONG mot
 * doan ma native nao doc duoc no. Widget chay trong tien trinh cua launcher,
 * cach WebView hai lop, nen no khong bao gio duoc phep "hoi" app xem hom nay
 * tieu bao nhieu.
 *
 * Cach giai: lop web GHI SAN mot ban tom tat rat nho ra SharedPreferences moi
 * lan du lieu doi. Widget chi doc ban tom tat do. Ban tom tat la mot BAN SAO —
 * co the cu vai giay so voi that, nhung khong bao gio sai, vi chi co mot noi
 * ghi ra no.
 *
 * DIEU WIDGET NAY KHONG LAM: ghi mot khoan chi ma khong mo app. Ghi duoc nghia
 * la phai viet vao IndexedDB, ma chi WebView lam duoc. Nen cham vao widget se
 * mo app voi o nhap da san sang — bot duoc buoc tim app va buoc dieu huong,
 * chu khong bo duoc buoc mo app. Noi dung khac la noi qua.
 */
public class XaxiWidget extends AppWidgetProvider {

    /** Noi lop web ghi ban tom tat; doc tu ca hai phia nen ten phai co dinh */
    public static final String PREFS = "xaxi_widget";

    public static final String KEY_TODAY = "today";
    public static final String KEY_MONTH = "month";
    public static final String KEY_MONTH_LABEL = "monthLabel";
    public static final String KEY_HINT = "hint";

    /** Bao MainActivity rang nguoi dung muon ghi ngay, khong phai chi mo app */
    public static final String EXTRA_QUICK = "com.mittohoa.xaxi_wallet.QUICK";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        render(context, manager, ids);
    }

    /** Ve lai moi widget dang cam tren man hinh */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, XaxiWidget.class));
        if (ids != null && ids.length > 0) render(context, manager, ids);
    }

    private static void render(Context context, AppWidgetManager manager, int[] ids) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        // Chua mo app lan nao thi chua co ban tom tat. Hien cau moi mo app chu
        // khong hien "0 ₫" — mot con so khong co that con te hon khong co so.
        boolean hasData = prefs.contains(KEY_TODAY);
        String today = prefs.getString(KEY_TODAY, "—");
        String month = prefs.getString(KEY_MONTH, "");
        String monthLabel = prefs.getString(KEY_MONTH_LABEL, "");
        String hint = prefs.getString(KEY_HINT, "");

        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.xaxi_widget);

            views.setTextViewText(R.id.widget_today, today);
            views.setTextViewText(
                R.id.widget_sub,
                hasData ? monthLabel + " · " + month : "Mở app một lần để bắt đầu"
            );
            views.setTextViewText(R.id.widget_hint, hint);
            views.setViewVisibility(R.id.widget_hint, hint.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);

            // Cham vao than widget: mo app binh thuong
            views.setOnClickPendingIntent(R.id.widget_root, launch(context, false));
            // Cham vao nut: mo app va dua thang con tro vao o nhap
            views.setOnClickPendingIntent(R.id.widget_add, launch(context, true));

            manager.updateAppWidget(id, views);
        }
    }

    private static PendingIntent launch(Context context, boolean quick) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (quick) intent.putExtra(EXTRA_QUICK, true);

        // Hai PendingIntent khac nhau phai co requestCode khac nhau, khong thi
        // Android coi la mot va ca hai nut cung lam mot viec.
        return PendingIntent.getActivity(
            context,
            quick ? 1 : 0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }
}
