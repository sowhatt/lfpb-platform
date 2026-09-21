import Foundation
import Vision
import AppKit

guard CommandLine.arguments.count >= 2 else {
    fputs("Usage: swift ocr.swift image.jpg\n", stderr)
    exit(1)
}

let path = CommandLine.arguments[1]
let url = URL(fileURLWithPath: path)

guard let image = NSImage(contentsOf: url) else {
    fputs("Impossible de lire l'image\n", stderr)
    exit(1)
}

var rect = NSRect(origin: .zero, size: image.size)

guard let cgImage = image.cgImage(
    forProposedRect: &rect,
    context: nil,
    hints: nil
) else {
    fputs("Impossible de convertir l'image\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["fr-FR", "en-US"]

let handler = VNImageRequestHandler(
    cgImage: cgImage,
    options: [:]
)

do {
    try handler.perform([request])
} catch {
    fputs("Erreur Vision: \(error)\n", stderr)
    exit(1)
}

let observations = request.results ?? []

let sorted = observations.sorted {
    let ay = $0.boundingBox.maxY
    let by = $1.boundingBox.maxY

    if abs(ay - by) > 0.01 {
        return ay > by
    }

    return $0.boundingBox.minX < $1.boundingBox.minX
}

for observation in sorted {
    guard let candidate = observation.topCandidates(1).first else {
        continue
    }

    let b = observation.boundingBox

    print(
        String(
            format:
                "conf=%.3f x=%.4f y=%.4f w=%.4f h=%.4f | %@",
            candidate.confidence,
            b.minX,
            b.minY,
            b.width,
            b.height,
            candidate.string
        )
    )
}
