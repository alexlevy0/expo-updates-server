import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config } from '../src/config';

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(config.paths.dataDir, '..', 'backups'); // Store backups outside data dir usually
const backupFile = path.join(backupDir, `backup-${timestamp}.tar.gz`);

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

console.log('📦 Creating backup...');

// Ensure data dir exists before backing up
if (!fs.existsSync(config.paths.dataDir)) {
    console.error(`Data directory not found at ${config.paths.dataDir}`);
    process.exit(1);
}

try {
    // Tar the data directory and keys directory
    // Using simple tar command via shell
    // We backup dataDir and keysDir
    
    const dirsToBackup = [config.paths.dataDir, config.paths.keysDir].filter(d => fs.existsSync(d));
    
    if (dirsToBackup.length === 0) {
        console.warn('Nothing to backup!');
        process.exit(0);
    }

    execSync(`tar -czf "${backupFile}" ${dirsToBackup.map(d => `"${d}"`).join(' ')}`, {
      stdio: 'inherit',
    });

    console.log(`✅ Backup created: ${backupFile}`);

    // Cleanup old backups (keep last 10)
    const backups = fs.readdirSync(backupDir)
    .filter(f => f.startsWith('backup-') && f.endsWith('.tar.gz'))
    .sort()
    .reverse();

    for (const old of backups.slice(10)) {
        fs.unlinkSync(path.join(backupDir, old));
        console.log(`🗑️  Removed old backup: ${old}`);
    }
} catch (error) {
    console.error('Backup failed:', error);
    process.exit(1);
}
