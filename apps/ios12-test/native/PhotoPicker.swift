import UIKit

final class PCTestPhotoPicker: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let store: NativeLibraryStore
    private let id: String
    private let revision: Int
    private let complete: (Result<[String:Any],ResolverFailure>) -> Void
    init(store: NativeLibraryStore, id: String, revision: Int, complete: @escaping (Result<[String:Any],ResolverFailure>) -> Void) { self.store = store; self.id = id; self.revision = revision; self.complete = complete }
    func present(from controller: UIViewController) {
        let picker = UIImagePickerController(); picker.sourceType = .photoLibrary; picker.mediaTypes = ["public.image"]; picker.delegate = self; controller.present(picker,animated:true)
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { picker.dismiss(animated:true) { self.complete(.success(["cancelled":true])) } }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey:Any]) {
        picker.dismiss(animated:true)
        guard let image = info[.originalImage] as? UIImage, image.size.width > 0, image.size.height > 0 else { complete(.failure(.code("ARTWORK_INVALID"))); return }
        let scale = min(1,1024 / max(image.size.width,image.size.height)), size = CGSize(width:image.size.width*scale,height:image.size.height*scale)
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let output = UIGraphicsImageRenderer(size:size,format:format).jpegData(withCompressionQuality:0.78) { _ in image.draw(in:CGRect(origin:.zero,size:size)) }
        DispatchQueue.global(qos:.userInitiated).async {
            var written: URL?
            do {
                guard output.count <= 1024 * 1024 else { throw ResolverFailure.code("ARTWORK_TOO_LARGE") }
                try FileManager.default.createDirectory(at:self.store.artworkDirectory,withIntermediateDirectories:true)
                let files = try FileManager.default.contentsOfDirectory(at:self.store.artworkDirectory,includingPropertiesForKeys:[.fileSizeKey])
                let bytes = files.reduce(0) { $0 + ((try? $1.resourceValues(forKeys:[.fileSizeKey]).fileSize) ?? 0) }
                guard bytes + output.count <= 24 * 1024 * 1024 else { throw ResolverFailure.code("ARTWORK_STORAGE_FULL") }
                let file = UUID().uuidString.lowercased()+".jpg", url = self.store.artworkDirectory.appendingPathComponent(file)
                try output.write(to:url,options:[.atomic,.completeFileProtectionUntilFirstUserAuthentication]); written = url
                let value = try self.store.command(["type":"cover","id":self.id,"revision":self.revision,"file":file])
                DispatchQueue.main.async { self.complete(.success(["cancelled":false,"library":self.store.snapshot(value)])) }
            } catch {
                if let written { try? FileManager.default.removeItem(at:written) }
                DispatchQueue.main.async { self.complete(.failure(error as? ResolverFailure ?? .code("ARTWORK_INVALID"))) }
            }
        }
    }
}
