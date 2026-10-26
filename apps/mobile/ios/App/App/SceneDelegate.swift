import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func sceneDidEnterBackground(_ scene: UIScene) {
        NativePlaybackOwner.shared.flush()
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        NativePlaybackOwner.shared.flush()
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        NativePlaybackOwner.shared.publishSnapshot()
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        // UIKit supplies the storyboard window before this callback. Replacing
        // it creates two bridges racing over first-install initialization.
        if window == nil {
            window = UIWindow(windowScene: windowScene)
            window?.rootViewController = BridgeViewController()
        }
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        window?.makeKeyAndVisible()
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
