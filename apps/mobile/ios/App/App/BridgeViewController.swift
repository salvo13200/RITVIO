import Capacitor

class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // The root document is fixed; scrolling belongs to Home/Search/Queue, not the player.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        bridge?.registerPluginInstance(RitvioPlaybackPlugin())
    }
}
