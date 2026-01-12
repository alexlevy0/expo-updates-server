import forge from 'node-forge';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config';

const PRIVATE_KEY_PATH = path.join(config.paths.keysDir, 'private-key.pem');
const CERTIFICATE_PATH = path.join(config.paths.keysDir, 'certificate.pem');

// Singleton cache
let privateKeyCache: string | null = null;
let certificateCache: string | null = null;

export function getPrivateKey(): string {
  if (privateKeyCache) return privateKeyCache;
  
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}. Run 'npm run keys:generate' first.`);
  }
  privateKeyCache = fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
  return privateKeyCache;
}

export function getCertificate(): string {
  if (certificateCache) return certificateCache;

  if (!fs.existsSync(CERTIFICATE_PATH)) {
    throw new Error(`Certificate not found at ${CERTIFICATE_PATH}. Run 'npm run keys:generate' first.`);
  }
  certificateCache = fs.readFileSync(CERTIFICATE_PATH, 'utf8');
  return certificateCache;
}

export function signManifest(manifestString: string): string {
  const privateKeyPem = getPrivateKey();
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha256.create();
  md.update(manifestString, 'utf8');
  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}

// Optimized hashing using Node crypto (Bun compatible)
// For large files, stream is safer for memory, but for reasonable bundles <100MB, file mapping or reading might be faster.
// Reviewer asked for Bun native if possible.
// Bun.file(path).arrayBuffer() is very fast in Bun.
export async function hashFile(filePath: string): Promise<string> {
  // Use Bun native file API if available (we assume Bun runtime)
  try {
     const file = Bun.file(filePath);
     const arrayBuffer = await file.arrayBuffer();
     // Use crypto.subtle or node crypto. Node crypto is often faster for sync hashing in Bun than await crypto.subtle?
     // Actually crypto.createHash with a buffer is very fast.
     return crypto.createHash('sha256').update(new Uint8Array(arrayBuffer)).digest('hex');
  } catch (e) {
      // Fallback to stream if Bun.file fails or memory issue
      return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('error', err => reject(err));
        stream.on('data', chunk => hash.update(chunk));
        stream.on('end', () => resolve(hash.digest('hex')));
      });
  }
}

export function hashString(content: string): string {
   return crypto.createHash('sha256').update(content).digest('hex');
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
