import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Certification } from "@opencode-ai/core/pipeline"

describe("Certification", () => {
  test("runCertification for known specialist in a temporary directory", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cert-test-"))
    try {
      writeFileSync(join(tmpDir, ".env.example"), "PORT=3000\n")
      writeFileSync(
        join(tmpDir, "index.ts"),
        'import { z } from "zod"\nconst port = process.env.PORT\nconst schema = z.object({})\n',
      )

      const report = Certification.runCertification("security", tmpDir)

      expect(report.specialist).toBe("security")
      expect(report.total).toBe(3)
      expect(report.passed).toBe(3)
      expect(report.score).toBe(100)
      expect(report.graded).toBe("A")
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test("runCertification for unknown specialist returns F grade and 0 score", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cert-test-unknown-"))
    try {
      const report = Certification.runCertification("inexistent", tmpDir)

      expect(report.specialist).toBe("inexistent")
      expect(report.graded).toBe("F")
      expect(report.score).toBe(0)
      expect(report.total).toBe(0)
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  test("formatCertification returns formatted report string with expected markers", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "cert-test-format-"))
    try {
      writeFileSync(join(tmpDir, ".env.example"), "PORT=3000\n")
      writeFileSync(
        join(tmpDir, "index.ts"),
        'import { z } from "zod"\nconst port = process.env.PORT\nconst schema = z.object({})\n',
      )

      const report = Certification.runCertification("security", tmpDir)
      const formatted = Certification.formatCertification(report)

      expect(formatted).toContain("Certification:")
      expect(formatted).toContain("Grade:")
      expect(formatted).toContain("Score:")
    } finally {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })
})
