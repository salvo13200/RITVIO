import Foundation
import Capacitor
import WebKit

class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        // The root document is fixed; scrolling belongs to Home/Search/Queue, not the player.
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        bridge?.registerPluginInstance(RitvioPlaybackPlugin())
        #if DEBUG
        guard NativeUIFixture.enabled else { return }
        UIStartupEvidence.record("bridge-loaded", controller:self)
        webView?.configuration.userContentController.add(UIStartupMessages(controller:self),name:"ritvioUIProbe")
        webView?.configuration.userContentController.addUserScript(WKUserScript(source:"""
            window.__ritvioStartupErrors=[];
            addEventListener('error',e=>{if(window.__ritvioStartupErrors.length<8)window.__ritvioStartupErrors.push(String(e.message).slice(0,240));});
            addEventListener('unhandledrejection',e=>{if(window.__ritvioStartupErrors.length<8)window.__ritvioStartupErrors.push(String(e.reason?.name||'PromiseRejected').slice(0,120));});
            for(const type of ['pointerdown','pointerup','click','popstate'])addEventListener(type,e=>{
                const target=e.target instanceof Element?e.target.closest('button,input,textarea'):null;
                const label=(target?.getAttribute('aria-label')||target?.textContent||type).slice(0,120);
                const x=Number.isFinite(e.clientX)?e.clientX:null,y=Number.isFinite(e.clientY)?e.clientY:null;
                setTimeout(()=>webkit.messageHandlers.ritvioUIProbe.postMessage({type,label,x,y,
                    dialogs:[...document.querySelectorAll('[role=dialog]')].map(d=>d.getAttribute('aria-label')),
                    heading:document.querySelector('.ios-content h1')?.textContent??null,
                    route:history.state?.ritvioLibrary??null}),0);
            },true);
            """, injectionTime:.atDocumentStart, forMainFrameOnly:true))
        #endif
    }
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        #if DEBUG
        guard NativeUIFixture.enabled else { return }
        UIStartupEvidence.record("view-appeared", controller:self)
        DispatchQueue.main.asyncAfter(deadline:.now()+12) { [weak self] in
            guard let self else { return }
            self.webView?.evaluateJavaScript("({ready:document.readyState,rootChildren:document.getElementById('root')?.childElementCount??0,viewportHeight:innerHeight,visualHeight:visualViewport?.height??null,rootHeight:document.getElementById('root')?.getBoundingClientRect().height??0,errors:window.__ritvioStartupErrors??[]})") { [weak self] result, _ in
                guard let self else { return }
                UIStartupEvidence.record("document-probe", controller:self, document:result as? [String:Any])
            }
        }
        #endif
    }
}

#if DEBUG
private final class UIStartupMessages: NSObject, WKScriptMessageHandler {
    weak var controller: BridgeViewController?
    init(controller:BridgeViewController) { self.controller=controller;super.init() }
    func userContentController(_ userContentController:WKUserContentController,didReceive message:WKScriptMessage) {
        guard let value=message.body as? [String:Any] else { return }
        DispatchQueue.main.async { [weak controller = self.controller] in
            guard let controller else { return }
            UIStartupEvidence.record("interaction",controller:controller,document:value)
        }
    }
}
/// Isolated simulator-fixture diagnostics, never active in a normal launch.
@MainActor private enum UIStartupEvidence {
    static let launch = UUID().uuidString
    static var instances = Set<String>()
    static var events: [[String:Any]] = []
    static var interactions: [[String:Any]] = []
    static func record(_ stage:String,controller:BridgeViewController,document:[String:Any]? = nil) {
        let identity = String(describing:ObjectIdentifier(controller))
        instances.insert(identity)
        var event: [String:Any] = ["stage":stage,"controller":identity,
            "visibleRoot":controller.view.window?.rootViewController === controller]
        if let document { event["document"] = document }
        if stage == "interaction" { interactions.append(event);interactions=Array(interactions.suffix(64)) }
        else { events.append(event);events=Array(events.suffix(32)) }
        let value: [String:Any] = ["schema":1,"launch":launch,"bridgeInstances":instances.count,"events":events,"interactions":interactions]
        do {
            let folder = FileManager.default.urls(for:.documentDirectory,in:.userDomainMask)[0].appendingPathComponent("ui-startup",isDirectory:true)
            try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
            try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]).write(to:folder.appendingPathComponent(launch+".json"),options:.atomic)
        } catch { /* Diagnostics cannot change application behavior. */ }
    }
}
#endif
