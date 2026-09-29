# Giu cac plugin tu viet: Capacitor goi chung qua ten lop trong @CapacitorPlugin,
# neu R8 doi ten thi cau noi khong tim thay.
-keep class app.xaxi.wallet.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * {
  @com.getcapacitor.PluginMethod public *;
}

# ML Kit tu mang theo quy tac giu lop cua no, nhung neu sau nay them tinh nang
# nhan dang khac thi giu them o day.
-keep class com.google.mlkit.vision.text.** { *; }
