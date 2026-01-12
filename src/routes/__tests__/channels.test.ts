import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { db } from '../../database';
import { channels } from '../../db/schema';
import { eq } from 'drizzle-orm';



describe('Channels API', () => {

    it('GET /api/channels lists channels', async () => {
        // Setup assumes setup.ts seeded initial channels? 
        // setup.ts inserts production/staging.
        const res = await request(app).get('/api/channels');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.find((c: any) => c.name === 'production')).toBeDefined();
    });

    it('POST /api/channels creates a channel', async () => {
        const res = await request(app)
            .post('/api/channels')
            .send({ name: 'beta', description: 'Beta Testers' });
        
        expect(res.status).toBe(201);
        expect(res.body.channel.name).toBe('beta');

        // Verify DB
        const ch = db.select().from(channels).where(eq(channels.name, 'beta')).get();
        expect(ch).toBeDefined();
    });

    it('DELETE /api/channels/:name deletes a channel', async () => {
        // Create first
        db.insert(channels).values({ name: 'temp', description: 'Temp' }).run();

        const res = await request(app).delete('/api/channels/temp');
        expect(res.status).toBe(200);

        const ch = db.select().from(channels).where(eq(channels.name, 'temp')).get();
        expect(ch).toBeUndefined();
    });
});
