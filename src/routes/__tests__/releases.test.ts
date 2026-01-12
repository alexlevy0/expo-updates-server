import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { db } from '../../database';
import { releases } from '../../db/schema';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';



describe('Releases API', () => {
    
    it('GET /api/releases lists releases', async () => {
        db.insert(releases).values({
            id: crypto.randomUUID(),
            runtimeVersion: '1.0.0',
            platform: 'ios',
            channel: 'production',
            bundlePath: 'bn',
            manifestJson: '{}'
        }).run();

        const res = await request(app).get('/api/releases');
        expect(res.status).toBe(200);
        expect(res.body.data.length).toBeGreaterThan(0);
        expect(res.body.meta.total).toBeGreaterThan(0);
    });

    it('POST /api/releases/:id/activate activates a release', async () => {
        const id1 = crypto.randomUUID();
        const id2 = crypto.randomUUID();
        
        // Insert two releases
        db.insert(releases).values([
            { id: id1, runtimeVersion: '1.0.0', platform: 'ios', channel: 'production', bundlePath: 'b', manifestJson: '{}', isActive: true },
            { id: id2, runtimeVersion: '1.0.0', platform: 'ios', channel: 'production', bundlePath: 'b', manifestJson: '{}', isActive: false }
        ]).run();

        // Activate id2
        const res = await request(app).post(`/api/releases/${id2}/activate`);
        expect(res.body.success).toBe(true);

        const r1 = db.select().from(releases).where(eq(releases.id, id1)).get();
        const r2 = db.select().from(releases).where(eq(releases.id, id2)).get();

        expect(r1?.isActive).toBe(false);
        expect(r2?.isActive).toBe(true);
    });

    it('DELETE /api/releases/:id deletes a release', async () => {
        const id = crypto.randomUUID();
        db.insert(releases).values({
            id, runtimeVersion: '1.0.0', platform: 'ios', channel: 'production', bundlePath: 'b', manifestJson: '{}' 
        }).run();

        const res = await request(app).delete(`/api/releases/${id}`);
        expect(res.status).toBe(200);

        const r = db.select().from(releases).where(eq(releases.id, id)).get();
        expect(r).toBeUndefined();
    });
});
