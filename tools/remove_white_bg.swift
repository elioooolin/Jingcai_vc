import AppKit
import Foundation

guard CommandLine.arguments.count >= 3 else {
  fputs("usage: remove_white_bg.swift <input> <output>\n", stderr)
  exit(1)
}

let inputPath = CommandLine.arguments[1]
let outputPath = CommandLine.arguments[2]

guard
  let image = NSImage(contentsOfFile: inputPath),
  let tiff = image.tiffRepresentation,
  let bitmap = NSBitmapImageRep(data: tiff)
else {
  fputs("failed to load image\n", stderr)
  exit(1)
}

let width = bitmap.pixelsWide
let height = bitmap.pixelsHigh
let whiteThreshold = 0.94

for y in 0..<height {
  for x in 0..<width {
    guard let color = bitmap.colorAt(x: x, y: y)?.usingColorSpace(.deviceRGB) else {
      continue
    }

    let isNearWhite = color.redComponent >= whiteThreshold &&
      color.greenComponent >= whiteThreshold &&
      color.blueComponent >= whiteThreshold

    if isNearWhite {
      bitmap.setColor(
        NSColor(
          calibratedRed: color.redComponent,
          green: color.greenComponent,
          blue: color.blueComponent,
          alpha: 0
        ),
        atX: x,
        y: y
      )
    }
  }
}

guard let pngData = bitmap.representation(using: .png, properties: [:]) else {
  fputs("failed to encode png\n", stderr)
  exit(1)
}

try pngData.write(to: URL(fileURLWithPath: outputPath))
