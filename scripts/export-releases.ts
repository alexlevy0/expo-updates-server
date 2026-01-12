import { db } from '../src/database';
import { releases, channels, runtimeVersions } from '../src/db/schema';
import fs from 'fs';
import path from 'path';

async function exportData() {
    try {
        console.log('Exporting database content...');
        
        const allReleases = db.select().from(releases).all();
        const allChannels = db.select().from(channels).all();
        
        // Runtime versions table doesn't exist in schema export usually if implied? 
        // Wait, schema.ts has runtimeVersions table?
        // Let's check schema.ts. If not, we just export what we have.
        // I recall runtimeVersions table exists.
        
        const exportData = {
            generatedAt: new Date().toISOString(),
            channels: allChannels,
            releases: allReleases,
        };

        const exportPath = path.join(process.cwd(), 'data', `export-${Date.now()}.json`);
        fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));

        console.log(`Export successful: ${exportPath}`);
        console.log(`Stats: ${allReleases.length} releases, ${allChannels.length} channels.`);

    } catch (error) {
        console.error('Export failed:', error);
    }
}

exportData();
