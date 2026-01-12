import express from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../database';
import { channels } from '../db/schema';
import { CreateChannelSchema } from '../types';

const router = express.Router();

router.get('/', (req, res, next) => {
    try {
        const allChannels = db.select().from(channels).orderBy(channels.name).all();
        res.json(allChannels);
    } catch (error) {
        next(error);
    }
});

router.post('/', (req, res, next) => {
    try {
        const data = CreateChannelSchema.parse(req.body);
        
        try {
            db.insert(channels).values({
                name: data.name,
                description: data.description || null,
            }).run();
            res.status(201).json({ success: true, channel: data });
        } catch (e: any) {
            if (e.message.includes('UNIQUE constraint failed') || e.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
                res.status(409).json({ error: 'Channel already exists' });
                return;
            }
            throw e;
        }
    } catch (error) {
        next(error);
    }
});

router.delete('/:name', (req, res, next) => {
    try {
        const deleted = db.delete(channels).where(eq(channels.name, req.params.name)).returning({ name: channels.name }).get();
        if (!deleted) {
            res.status(404).json({ error: 'Channel not found' });
            return;
        }
        res.json({ success: true });
    } catch (error) {
         // Check for foreign key constraints?
         // better-sqlite3 throws specific error if FK constraint fails
        if ((error as any).code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
             res.status(400).json({ error: 'Cannot delete channel: it has associated releases.' });
             return;
        }
        next(error);
    }
});


export default router;
