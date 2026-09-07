import { useEffect } from "react"

export default function useAppMotion() {
  useEffect(() => {
    const device = navigator as Navigator & { deviceMemory?: number; connection?: EventTarget & { saveData?: boolean } }
    const update = () => {
      const economy = (device.deviceMemory !== undefined && device.deviceMemory <= 4)
        || (device.hardwareConcurrency > 0 && device.hardwareConcurrency <= 4) || device.connection?.saveData
      document.documentElement.dataset.cozyMotion = document.hidden ? "paused" : economy ? "economy" : "standard"
    }
    update()
    document.addEventListener("visibilitychange", update)
    device.connection?.addEventListener("change", update)
    return () => {
      document.removeEventListener("visibilitychange", update)
      device.connection?.removeEventListener("change", update)
      delete document.documentElement.dataset.cozyMotion
    }
  }, [])
}
