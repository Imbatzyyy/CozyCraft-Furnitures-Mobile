import { Component, useEffect, type ErrorInfo, type ReactNode } from "react"
import { RouterProvider } from "react-router"
import { router } from "./routes"
import { reportMobileClientError } from "./lib/mobile-data"

class MobileErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    void reportMobileClientError(new Error(`${error.message}\n${info.componentStack || ""}`), "react_boundary")
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <main className="mobile-recovery-screen">
      <section>
        <span className="material-symbols-rounded" aria-hidden="true">chair</span>
        <p>COZYCRAFT CARE</p>
        <h1>Let’s set this room right.</h1>
        <p>Your account and order data are safe. Reload the app to restore this screen.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload CozyCraft <b>→</b></button>
      </section>
    </main>
  }
}

export default function App() {
  useEffect(() => {
    const handleNativeBack = (event: MessageEvent) => {
      if (event.data?.type !== "cozycraft-native-back") return
      const route = window.location.hash.split("?")[0]
      if (route === "#/shop") return
      if (["#/sign-in", "#/create-account", "#/reset-password", "#/terms", "#/privacy-policy", "#/about", "#/contact"].includes(route)) {
        window.location.hash = "#/welcome"
        return
      }
      window.parent.postMessage({ type: "cozycraft-native-back-unhandled" }, "*")
    }
    window.addEventListener("message", handleNativeBack)
    const reportWindowError = (event: ErrorEvent) => {
      void reportMobileClientError(event.error || new Error(event.message), "window_error")
    }
    const reportPromiseError = (event: PromiseRejectionEvent) => {
      void reportMobileClientError(event.reason, "unhandled_promise")
    }
    window.addEventListener("error", reportWindowError)
    window.addEventListener("unhandledrejection", reportPromiseError)
    return () => {
      window.removeEventListener("message", handleNativeBack)
      window.removeEventListener("error", reportWindowError)
      window.removeEventListener("unhandledrejection", reportPromiseError)
    }
  }, [])
  return <MobileErrorBoundary><RouterProvider router={router} /></MobileErrorBoundary>
}
