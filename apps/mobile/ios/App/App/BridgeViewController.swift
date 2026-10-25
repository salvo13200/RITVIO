import Capacitor
import UIKit

class BridgeViewController: CAPBridgeViewController {
    private var rootScrollObservation: NSKeyValueObservation?
    override func capacitorDidLoad() {
        // The root document is fixed; scrolling belongs to Home/Search/Queue, not the player.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        // Keyboard/focus recovery must not scroll the fixed root above its safe area.
        // DOM overflow containers retain their independent scrolling.
        rootScrollObservation = webView?.scrollView.observe(\.contentOffset, options: [.new]) { scrollView, _ in
            DispatchQueue.main.async { [weak scrollView] in
                guard let scrollView, scrollView.contentOffset != .zero else { return }
                scrollView.setContentOffset(.zero, animated: false)
            }
        }
        bridge?.registerPluginInstance(RitvioPlaybackPlugin())
    }
}
