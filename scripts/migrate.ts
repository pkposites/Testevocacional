// Aplica server/db/schema.sql no DATABASE_URL (idempotente).
import { createPostgresDb, schemaSql } from '../server/db';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Defina DATABASE_URL');
const db = await createPostgresDb(url);
await db.query(schemaSql());
console.log('Schema aplicado.');
process.exit(0);
