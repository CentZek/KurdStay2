import { Capacitor } from '@capacitor/core'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web'
}

export function isPluginAvailable(name: string): boolean {
  return Capacitor.isPluginAvailable(name)
}

export async function initNativeFeatures() {
  if (!isNative()) return

  if (isPluginAvailable('StatusBar')) {
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar')
      await StatusBar.setStyle({ style: Style.Light })
      if (getPlatform() === 'android') {
        await StatusBar.setBackgroundColor({ color: '#102b3d' })
      }
    } catch { /* Native appearance is optional on unsupported devices. */ }
  }

  if (isPluginAvailable('SplashScreen')) {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen')
      await SplashScreen.hide()
    } catch { /* The operating system will dismiss the splash screen. */ }
  }
}

export async function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'medium') {
  if (!isNative() || !isPluginAvailable('Haptics')) return
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics')
  const styles = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy }
  await Haptics.impact({ style: styles[type] })
}

export async function openInBrowser(url: string) {
  if (isNative() && isPluginAvailable('Browser')) {
    const { Browser } = await import('@capacitor/browser')
    await Browser.open({ url })
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}
