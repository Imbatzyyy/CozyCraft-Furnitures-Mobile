import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './native-responsive.css'
import { applyMobileTextSize, readMobileTextSize } from './lib/mobile-text-size'

// Apply before React renders so opening the app or moving between routes never
// flashes the old text size.
applyMobileTextSize(readMobileTextSize())

// Expose the native platform to responsive CSS without coupling the storefront
// bundle to Capacitor. The parent Ionic shell repeats this as a postMessage
// because an embedded WKWebView frame may omit the iPhone user-agent token.
const applyNativePlatform = (platform: string, iosMajor = 0) => {
  const root = document.documentElement
  const normalized = platform.toLowerCase()
  root.classList.toggle('cozy-platform-android', normalized === 'android')
  root.classList.toggle('cozy-platform-ios', normalized === 'ios')
  root.classList.toggle('cozy-platform-ios26', normalized === 'ios' && iosMajor >= 26)
  if (normalized === 'ios') root.dataset.iosMajor = String(iosMajor)
}

if (typeof navigator !== 'undefined') {
  const userAgent = navigator.userAgent
  const isTouchMac = /Macintosh/i.test(userAgent) && navigator.maxTouchPoints > 1
  const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || isTouchMac
  const match = userAgent.match(/(?:CPU(?: iPhone)? OS|iPhone OS) (\d+)[._]/i)
  const iosMajor = Number(match?.[1] || 0)

  if (/Android/i.test(userAgent)) applyNativePlatform('android')
  else if (isIOS) applyNativePlatform('ios', iosMajor)

  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'cozycraft-native-platform') return
    applyNativePlatform(String(event.data.platform || ''), Number(event.data.iosMajor || 0))
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
