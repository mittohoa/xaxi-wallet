import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mittohoa.xaxi_wallet',
  appName: 'XAXI',
  webDir: 'dist',
  android: {
    // Khong xin quyen doc SMS / thong bao — app chi nhan van ban nguoi dung chu dong chia se
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
