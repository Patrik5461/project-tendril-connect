import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let bridgeViewController = CAPBridgeViewController()
        window?.rootViewController = bridgeViewController
        window?.makeKeyAndVisible()

        // Ťahanie od ľavého okraja = späť, ako to iOS má všade inde. Appka je
        // obal nad webom, takže bez tohto sa používateľ z detailu zákazky
        // dostane naspäť iba cez spodnú navigáciu. WKWebView vznikne až v
        // `viewDidLoad`, ktorý spustí až `makeKeyAndVisible` vyššie.
        bridgeViewController.webView?.allowsBackForwardNavigationGestures = true

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
