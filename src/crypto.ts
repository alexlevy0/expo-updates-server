import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { config } from './config';

const PRIVATE_KEY_PATH = path.join(config.paths.keysDir, 'private-key.pem');
const PUBLIC_KEY_PATH = path.join(config.paths.keysDir, 'public-key.pem');
const CERTIFICATE_PATH = path.join(config.paths.keysDir, 'certificate.pem');

export function getPrivateKey(): string {
  if (!fs.existsSync(PRIVATE_KEY_PATH)) {
    throw new Error(`Private key not found at ${PRIVATE_KEY_PATH}. Run 'npm run keys:generate' first.`);
  }
  return fs.readFileSync(PRIVATE_KEY_PATH, 'utf8');
}

export function getCertificate(): string {
  if (!fs.existsSync(CERTIFICATE_PATH)) {
    throw new Error(`Certificate not found at ${CERTIFICATE_PATH}. Run 'npm run keys:generate' first.`);
  }
  return fs.readFileSync(CERTIFICATE_PATH, 'utf8');
}

export function signManifest(manifestString: string): string {
  const privateKeyPem = getPrivateKey();
  const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
  const md = forge.md.sha256.create();
  md.update(manifestString, 'utf8');
  const signature = privateKey.sign(md);
  return forge.util.encode64(signature);
}

// Node native crypto for faster hashing of assets
// Node native crypto for faster hashing of assets
export function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', err => reject(err));
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function hashString(content: string): string {
   return crypto.createHash('sha256').update(content).digest('hex');
}

export function hashBuffer(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
