import { describe, expect, test } from "bun:test"
import { isPdfAttachment, isMedia, isImageAttachment, sniffAttachmentMime } from "@/util/media"

describe("isPdfAttachment", () => {
  test("recognizes application/pdf", () => {
    expect(isPdfAttachment("application/pdf")).toBe(true)
  })

  test("rejects other mime types", () => {
    expect(isPdfAttachment("image/png")).toBe(false)
  })
})

describe("isMedia", () => {
  test("returns true for image types", () => {
    expect(isMedia("image/png")).toBe(true)
    expect(isMedia("image/jpeg")).toBe(true)
  })

  test("returns true for PDF", () => {
    expect(isMedia("application/pdf")).toBe(true)
  })

  test("returns false for non-media types", () => {
    expect(isMedia("text/plain")).toBe(false)
  })
})

describe("isImageAttachment", () => {
  test("returns true for common image types", () => {
    expect(isImageAttachment("image/png")).toBe(true)
    expect(isImageAttachment("image/jpeg")).toBe(true)
    expect(isImageAttachment("image/gif")).toBe(true)
  })

  test("returns false for SVG", () => {
    expect(isImageAttachment("image/svg+xml")).toBe(false)
  })

  test("returns false for PDF", () => {
    expect(isImageAttachment("application/pdf")).toBe(false)
  })
})

describe("sniffAttachmentMime", () => {
  test("sniffs PNG from header bytes", () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("image/png")
  })

  test("sniffs JPEG from FF D8 FF prefix", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("image/jpeg")
  })

  test("sniffs GIF from header", () => {
    const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("image/gif")
  })

  test("sniffs PDF from header", () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("application/pdf")
  })

  test("returns fallback for unknown bytes", () => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02])
    expect(sniffAttachmentMime(bytes, "text/plain")).toBe("text/plain")
  })

  test("sniffs WebP from RIFF+WEBP header", () => {
    const riff = new Uint8Array([0x52, 0x49, 0x46, 0x46])
    const webp = new Uint8Array([0x57, 0x45, 0x42, 0x50])
    const bytes = new Uint8Array([...riff, 0x00, 0x00, 0x00, 0x00, ...webp])
    expect(sniffAttachmentMime(bytes, "application/octet-stream")).toBe("image/webp")
  })
})
