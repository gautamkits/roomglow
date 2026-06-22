require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');
const fs = require('fs');

const schema = fs.readFileSync('db/schema.sql', 'utf8');
const statements = schema.split(';').map(s => s.trim()).filter(Boolean);

(async () => {
  for (const stmt of statements) {
    await sql.query(stmt);
    console.log('OK:', stmt.slice(0, 60) + '...');
  }
  console.log('\nAll tables created!');
  process.exit(0);
})().catch(e => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
