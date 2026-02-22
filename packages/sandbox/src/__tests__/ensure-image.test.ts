import { describe, it, expect } from "vitest";
import { buildTar } from "../ensure-image.js";

describe("buildTar", () => {
  it("should produce a valid tar archive structure", () => {
    const content = "FROM node:22-slim\nWORKDIR /workspace\n";
    const tar = buildTar(content);

    // Tar = 512-byte header + data padded to 512 + 1024-byte end marker
    const dataLen = Buffer.from(content, "utf-8").length;
    const dataPadded = Math.ceil(dataLen / 512) * 512;
    expect(tar.length).toBe(512 + dataPadded + 1024);

    // Header: filename starts at offset 0
    const name = tar.toString("utf-8", 0, 10).replace(/\0/g, "");
    expect(name).toBe("Dockerfile");

    // Header: size field at offset 124, 11 octal chars
    const sizeOctal = tar.toString("utf-8", 124, 135).replace(/\0/g, "");
    expect(parseInt(sizeOctal, 8)).toBe(dataLen);

    // Header: typeflag at offset 156 = '0' (regular file)
    expect(tar.toString("utf-8", 156, 157)).toBe("0");

    // Data: starts at offset 512
    const extracted = tar.toString("utf-8", 512, 512 + dataLen);
    expect(extracted).toBe(content);

    // End-of-archive: last 1024 bytes are all zeros
    const endBlock = tar.subarray(tar.length - 1024);
    expect(endBlock.every((b) => b === 0)).toBe(true);
  });

  it("should compute a valid checksum", () => {
    const tar = buildTar("FROM alpine\n");

    // Read stored checksum from header (offset 148, 6 octal digits)
    const storedOctal = tar.toString("utf-8", 148, 154).replace(/\0/g, "");
    const storedChecksum = parseInt(storedOctal, 8);

    // Recompute: sum all header bytes with checksum field (148-155) treated as spaces
    const header = Buffer.from(tar.subarray(0, 512));
    header.fill(0x20, 148, 156);
    let computed = 0;
    for (let i = 0; i < 512; i++) computed += header[i]!;

    expect(storedChecksum).toBe(computed);
  });
});
