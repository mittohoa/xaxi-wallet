/**
 * Cau noi toi bo doc chinh ta cua he dieu hanh.
 *
 * Uu tien nhan dang ngay tren may (EXTRA_PREFER_OFFLINE). Goi tieng Viet do he
 * thong quan ly — nguoi dung tai mot lan trong Cai dat cua may, app khong phai
 * nhoi them gi vao ban cai.
 *
 * App khong ghi am ra tep. Am thanh chi di qua bo nhan dang cua he thong.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'

interface VoicePlugin {
  listen(options: { language?: string }): Promise<{ text: string; alternatives?: string[] }>
  stop(): Promise<void>
  isAvailable(): Promise<{ available: boolean }>
}

const Voice = registerPlugin<VoicePlugin>('Voice')

export function voiceSupported(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Voice')
}

/** Hoi he thong xem co bo nhan dang khong; sai thi khong hien nut micro */
export async function voiceReady(): Promise<boolean> {
  if (!voiceSupported()) return false
  try {
    const { available } = await Voice.isAvailable()
    return available
  } catch {
    return false
  }
}

export async function listenOnce(language = 'vi-VN'): Promise<string> {
  if (!voiceSupported()) throw new Error('Thiết bị này chưa hỗ trợ nhập bằng giọng nói.')
  const { text } = await Voice.listen({ language })
  return text ?? ''
}

export async function stopListening(): Promise<void> {
  if (voiceSupported()) await Voice.stop().catch(() => undefined)
}
