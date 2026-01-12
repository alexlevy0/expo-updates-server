import forge from 'node-forge';
import fs from 'fs';
import path from 'path';
import { config } from '../src/config';

// Ensure keys dir exists
if (!fs.existsSync(config.paths.keysDir)) {
  fs.mkdirSync(config.paths.keysDir, { recursive: true });
}

const INFO_FLAG = process.argv.includes('--info');

if (INFO_FLAG) {
  // Just show info
  console.log('Key Info (Not implemented yet - just verifying paths)');
  process.exit(0);
}

console.log('Generating RSA 2048 keypair...');
const keypair = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });

// Convert to PEM
const privateKeyPem = forge.pki.privateKeyToPem(keypair.privateKey);
const publicKeyPem = forge.pki.publicKeyToPem(keypair.publicKey);

// Generate Self-Signed Certificate
console.log('Generating Self-Signed Certificate...');
const cert = forge.pki.createCertificate();
cert.publicKey = keypair.publicKey;
cert.serialNumber = '01'; // Fixed serial for simplicity, or random
cert.validity.notBefore = new Date();
cert.validity.notAfter = new Date();
cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10); // 10 years

const attrs = [{
  name: 'commonName',
  value: 'Expo Updates Self-Hosted'
}, {
  name: 'countryName',
  value: 'FR'
}, {
  shortName: 'ST',
  value: 'France'
}, {
  name: 'organizationName',
  value: 'Self Hosted'
}];

cert.setSubject(attrs);
cert.setIssuer(attrs);
cert.sign(keypair.privateKey, forge.md.sha256.create());

const certPem = forge.pki.certificateToPem(cert);

// Write files
const privateKeyPath = path.join(config.paths.keysDir, 'private-key.pem');
const publicKeyPath = path.join(config.paths.keysDir, 'public-key.pem');
const certPath = path.join(config.paths.keysDir, 'certificate.pem');

fs.writeFileSync(privateKeyPath, privateKeyPem, { mode: 0o600 });
fs.writeFileSync(publicKeyPath, publicKeyPem);
fs.writeFileSync(certPath, certPem);

console.log('Keys generated successfully in ' + config.paths.keysDir);
