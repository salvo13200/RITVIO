import UIKit
import PhotosUI
import UniformTypeIdentifiers
import ImageIO

/// System picker grants access only to the selected photo; no whole-library read permission.
final class LibraryArtworkPicker: NSObject, PHPickerViewControllerDelegate {
    private let store: NativeLibraryStore
    private let id: String
    private let revision: Int
    private let complete: (Result<LibraryState?, ResolverFailure>) -> Void
    init(store: NativeLibraryStore, id: String, revision: Int, complete: @escaping (Result<LibraryState?, ResolverFailure>) -> Void) {
        self.store = store; self.id = id; self.revision = revision; self.complete = complete
    }
    func present(from controller: UIViewController) {
        var config = PHPickerConfiguration(); config.filter = .images; config.selectionLimit = 1
        let picker = PHPickerViewController(configuration: config); picker.delegate = self
        controller.present(picker, animated: true)
    }
    static func encode(_ bytes: Data) throws -> Data {
        guard bytes.count <= 20 * 1024 * 1024, let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways:true,
                kCGImageSourceCreateThumbnailWithTransform:true, kCGImageSourceThumbnailMaxPixelSize:1024] as CFDictionary) else { throw ResolverFailure.code("ARTWORK_INVALID") }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil) else { throw ResolverFailure.code("ARTWORK_INVALID") }
        // Encode pixels only: camera metadata, GPS and orientation tags are not copied.
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality:0.78] as CFDictionary)
        guard CGImageDestinationFinalize(destination), output.length <= 1024 * 1024 else { throw ResolverFailure.code("ARTWORK_TOO_LARGE") }
        return output as Data
    }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard let provider = results.first?.itemProvider else { complete(.success(nil)); return }
        provider.loadDataRepresentation(forTypeIdentifier: UTType.image.identifier) { [self] bytes, error in
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                var created: URL?
                do {
                    guard error == nil, let bytes else { throw ResolverFailure.code("ARTWORK_INVALID") }
                    let output = try Self.encode(bytes)
                    try FileManager.default.createDirectory(at: store.artworkDirectory, withIntermediateDirectories: true)
                    let files = try FileManager.default.contentsOfDirectory(at: store.artworkDirectory, includingPropertiesForKeys:[.fileSizeKey])
                    let size = files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys:[.fileSizeKey]).fileSize) ?? 0) }
                    guard size + output.count <= 24 * 1024 * 1024 else { throw ResolverFailure.code("ARTWORK_STORAGE_FULL") }
                    let name = UUID().uuidString.lowercased() + ".jpg", url = store.artworkDirectory.appendingPathComponent(name)
                    try output.write(to: url, options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]); created = url
                    let state = try store.command(["type":"cover", "id":id, "revision":revision, "file":name])
                    complete(.success(state))
                } catch {
                    if let created { try? FileManager.default.removeItem(at: created) }
                    complete(.failure((error as? ResolverFailure) ?? .code("ARTWORK_WRITE_FAILED")))
                }
            }
        }
    }
}
