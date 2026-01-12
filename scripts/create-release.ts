import fs from 'fs';
import path from 'path';
import FormData from 'form-data';
import http from 'http';
import https from 'https';
import { URL } from 'url';

// CLI Usage:
// tsx scripts/create-release.ts --bundle <path> --platform <ios|android> --runtime <version> [--channel <name>] [--server <url>]

const args = process.argv.slice(2);
function getArg(name: string): string | null {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

const bundlePath = getArg('--bundle');
const platform = getArg('--platform');
const runtimeVersion = getArg('--runtime');
const channel = getArg('--channel') || 'production';
const serverUrl = getArg('--server') || 'http://localhost:3000';
const message = getArg('--message') || 'CLI Release';

if (!bundlePath || !platform || !runtimeVersion) {
  console.error('Usage: tsx scripts/create-release.ts --bundle <path-to-dist.zip> --platform <ios|android> --runtime <runtime-ver> [--channel <prod>] [--server <url>]');
  process.exit(1);
}

const form = new FormData();
form.append('platform', platform);
form.append('runtimeVersion', runtimeVersion);
form.append('channel', channel);
form.append('message', message);
form.append('bundle', fs.createReadStream(path.resolve(bundlePath)));

console.log(`Uploading release to ${serverUrl}...`);

const url = new URL(`${serverUrl}/api/releases/upload`);
const lib = url.protocol === 'https:' ? https : http;

const req = lib.request(url, {
  method: 'POST',
  headers: form.getHeaders(),
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Success!', JSON.parse(data));
    } else {
      console.error('Failed:', res.statusCode, data);
      process.exit(1);
    }
  });
});

req.on('error', (err) => {
  console.error('Request error:', err);
  process.exit(1);
});

form.pipe(req);
