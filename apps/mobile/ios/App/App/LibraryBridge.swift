import Foundation
import Capacitor

extension RitvioPlaybackPlugin {
    func libraryValue(_ state: LibraryState) -> [String: Any] {
        var result = NativeLibraryStore.shared.snapshot(state)
        #if DEBUG
        if NativeUIFixture.enabled {
            for key in ["likes", "recent"] { result[key] = NativeUIFixture.present(["items": result[key] ?? []])["items"] }
            result["playlists"] = (result["playlists"] as? [[String: Any]] ?? []).map { playlist -> [String: Any] in
                var value = playlist; value["items"] = NativeUIFixture.present(["items": value["items"] ?? []])["items"]; return value
            }
        }
        #endif
        return result
    }
    func emitLibrary(_ state: LibraryState) {
        let value = libraryValue(state)
        DispatchQueue.main.async { [weak self] in self?.notifyListeners("library", data: value) }
    }
    private func libraryOperation(_ call: CAPPluginCall, _ action: @escaping () throws -> LibraryState) {
        libraryWorker.async {
            do { let state = try action(); let result = self.libraryValue(state); self.emitLibrary(state); call.resolve(result) }
            catch { call.reject("Library operation could not complete", (error as? ResolverFailure)?.identifier ?? "LIBRARY_UNAVAILABLE") }
        }
    }
    @objc func library(_ call: CAPPluginCall) { libraryOperation(call) { try NativeLibraryStore.shared.read() } }
    @objc func libraryCommand(_ call: CAPPluginCall) {
        guard let type = call.getString("type"), ["like","create","rename","delete","add","remove","move","clearHistory"].contains(type) else { call.reject("Invalid library command", "INVALID_LIBRARY_COMMAND"); return }
        var input: [String: Any] = ["type":type]
        for field in ["name","description","id","revision","track","liked","index","from","to"] { if let value = call.getValue(field) { input[field] = value } }
        #if DEBUG
        if NativeUIFixture.enabled, let track = input["track"] as? [String: Any] { input["track"] = NativeUIFixture.playbackTrack(track) }
        #endif
        let captured = input
        libraryOperation(call) { try NativeLibraryStore.shared.command(captured) }
    }
    @objc func saveQueue(_ call: CAPPluginCall) {
        guard let name = call.getString("name"), let revision = NativeLibraryStore.integer(call.getValue("revision")) else { call.reject("Invalid queue save", "INVALID_LIBRARY_COMMAND"); return }
        DispatchQueue.main.async {
            let state = NativePlaybackOwner.shared.snapshot()
            guard state["queueRevision"] as? Int == revision else { call.reject("Queue changed", "QUEUE_CHANGED"); return }
            let items = state["items"] as? [[String: Any]] ?? [], order = state["order"] as? [Int] ?? []
            guard !items.isEmpty, order.count == items.count else { call.reject("Queue is empty", "INVALID_QUEUE"); return }
            let ordered = order.map { items[$0] }
            self.libraryOperation(call) { try NativeLibraryStore.shared.command(["type":"createFromTracks", "name":name, "items":ordered]) }
        }
    }
    @objc func navigationState(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.bridge?.webView?.allowsBackForwardNavigationGestures = call.getBool("canGoBack") ?? false; call.resolve() }
    }
    @objc func chooseArtwork(_ call: CAPPluginCall) {
        guard call.getString("kind") == "playlist", let id = call.getString("id"), UUID(uuidString:id) != nil,
              let revision = NativeLibraryStore.integer(call.getValue("revision")) else { call.reject("Personal playlist required", "INVALID_ARTWORK_TARGET"); return }
        DispatchQueue.main.async {
            guard self.artworkPicker == nil, let controller = self.bridge?.viewController, controller.presentedViewController == nil else { call.reject("Another picker is open", "ARTWORK_BUSY"); return }
            let picker = LibraryArtworkPicker(store: NativeLibraryStore.shared, id:id, revision:revision) { [weak self] result in
                DispatchQueue.main.async {
                    guard let self else { call.reject("Library unavailable", "LIBRARY_UNAVAILABLE"); return }
                    self.artworkPicker = nil
                    switch result {
                    case .success(nil): call.resolve(["cancelled":true])
                    case .success(let state?): self.emitLibrary(state); call.resolve(["cancelled":false, "library":self.libraryValue(state)])
                    case .failure(let failure): call.reject("Artwork could not be saved", failure.identifier)
                    }
                }
            }
            self.artworkPicker = picker; picker.present(from:controller)
        }
    }
    @objc func removeArtwork(_ call: CAPPluginCall) {
        guard call.getString("kind") == "playlist", let id = call.getString("id"), let revision = NativeLibraryStore.integer(call.getValue("revision")) else { call.reject("Personal playlist required", "INVALID_ARTWORK_TARGET"); return }
        libraryOperation(call) { try NativeLibraryStore.shared.command(["type":"cover", "id":id, "revision":revision]) }
    }
}
