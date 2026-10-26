import Foundation

enum PCHeader {
    /// HTTPURLResponse.value(forHTTPHeaderField:) arrived in iOS 13.
    /// Keep the same case-insensitive read, rejecting ambiguous duplicate values.
    static func value(_ response: HTTPURLResponse, _ name: String) -> String? {
        let values = response.allHeaderFields.compactMap { key, value -> String? in
            guard let key = key as? String, key.caseInsensitiveCompare(name) == .orderedSame,
                  let value = value as? String else { return nil }
            return value
        }
        guard values.count == 1, let value = values.first, value.utf8.count <= 4096 else { return nil }
        return value
    }
}
