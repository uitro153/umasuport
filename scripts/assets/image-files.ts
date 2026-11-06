import { createHash } from 'node:crypto';

export function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
/** Validate the actual PNG signature/IHDR rather than trusting file extensions. */
export function pngInfo(bytes: Buffer) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG signature/IHDR');
  const width = bytes.readUInt32BE(16); const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('PNG dimensions outside expected source bounds');
  return { width, height, bytes: bytes.length, mimeType: 'image/png' as const, sha256: sha256(bytes) };
}
