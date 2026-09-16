import UIKit
import Capacitor

/// Keeps the native surface behind the edge-to-edge storefront consistently
/// white. iOS 26 and newer add a soft fade to the top of every scroll view by
/// default; on WKWebView that fade can darken the status-bar safe area even
/// though the webpage and header are light.
final class CozyCraftBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        guard let webView else { return }
        webView.isOpaque = true
        webView.backgroundColor = .white
        webView.underPageBackgroundColor = .white
        webView.scrollView.backgroundColor = .white

        if #available(iOS 26.0, *) {
            webView.scrollView.topEdgeEffect.isHidden = true
        }

        statusBarStyle = .darkContent
        setNeedsStatusBarAppearanceUpdate()
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.backgroundColor = .white
        window?.rootViewController = CozyCraftBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
