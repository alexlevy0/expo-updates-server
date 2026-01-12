import { db } from '../src/database';
import { channels } from '../src/db/schema';
import { sql } from 'drizzle-orm';
import { $ } from 'bun';

async function main() {
  console.log('Initializing database schema with Drizzle Kit...');
  
  // Use Bun shell to run drizzle-kit push
  try {
      await $`bun drizzle-kit push`;
  } catch (e) {
      console.error('Failed to push schema:', e);
      process.exit(1);
  }

  console.log('Seeding initial channels...');
  
  // Seed channels
  try {
      db.insert(channels).values([
          { name: 'production', description: 'Production releases - end users' },
          { name: 'staging', description: 'Staging releases - QA and testing' },
          { name: 'development', description: 'Development releases - dev team' }
      ]).onConflictDoNothing().run();
      
      console.log('Database initialized successfully.');
  } catch (e) {
      console.error('Error seeding database:', e);
      process.exit(1);
  }
}

main();
