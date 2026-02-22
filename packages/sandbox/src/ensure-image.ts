import { Readable } from "node:stream";
import type Dockerode from "dockerode";
import type { Logger } from "@augure/types";
import { noopLogger } from "@augure/types";

const DOCKERFILE = `FROM node:22-slim
RUN apt-get update && apt-get install -y --no-install-recommends \\
    python3 curl jq git \\
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
`;

/**
 * Build a minimal tar archive containing a single Dockerfile.
 * Tar format: 512-byte header + content padded to 512 bytes.
 */
export function buildTar(content: string): Buffer {
  const data = Buffer.from(content, "utf-8");
  const name = "Dockerfile";

  const header = Buffer.alloc(512, 0);
  // name (0-99)
  header.write(name, 0, 100, "utf-8");
  // mode (100-107)
  header.write("0000644\0", 100, 8, "utf-8");
  // uid (108-115)
  header.write("0000000\0", 108, 8, "utf-8");
  // gid (116-123)
  header.write("0000000\0", 116, 8, "utf-8");
  // size (124-135) — octal, 11 chars + null
  header.write(data.length.toString(8).padStart(11, "0") + "\0", 124, 12, "utf-8");
  // mtime (136-147)
  header.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "utf-8");
  // typeflag (156) — '0' for regular file
  header.write("0", 156, 1, "utf-8");

  // checksum (148-155): sum of all header bytes with checksum field as spaces
  header.fill(0x20, 148, 156); // spaces for checksum field
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i]!;
  header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf-8");

  // Data padded to 512-byte boundary
  const padding = 512 - (data.length % 512 || 512);
  const dataPadded = padding > 0 && padding < 512
    ? Buffer.concat([data, Buffer.alloc(padding, 0)])
    : data;

  // End-of-archive: two 512-byte blocks of zeros
  const end = Buffer.alloc(1024, 0);

  return Buffer.concat([header, dataPadded, end]);
}

/**
 * Ensure a Docker image exists locally. If not, build it automatically.
 */
export async function ensureImage(
  docker: Dockerode,
  imageName: string,
  logger?: Logger,
): Promise<void> {
  const log = logger ?? noopLogger;

  log.debug(`Checking image: ${imageName}`);
  try {
    await docker.getImage(imageName).inspect();
    log.debug("Image exists");
    return; // image exists
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode !== undefined && statusCode !== 404) throw err;
  }

  log.info(`Image "${imageName}" not found, building...`);

  const tar = buildTar(DOCKERFILE);
  const stream = await docker.buildImage(Readable.from(tar), {
    t: imageName,
  });

  // Wait for build to complete
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      },
      (event: { stream?: string }) => {
        if (event.stream) {
          const line = event.stream.trim();
          if (line) log.debug(line);
        }
      },
    );
  });

  log.info(`Image "${imageName}" built`);
}
