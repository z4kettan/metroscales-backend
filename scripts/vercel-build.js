// Build step on Vercel: apply database migrations, create the dealer login
// if SEED_ADMIN_PASSWORD is set (does nothing when it already exists), then
// compile. Migrations use the direct (unpooled) connection when there is one.
const { execSync } = require('child_process');

const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Add a Postgres database to the Vercel project first.');
  process.exit(1);
}

run('npx prisma generate');
run('npx prisma migrate deploy', { DATABASE_URL: direct });
if (process.env.SEED_ADMIN_PASSWORD) run('npx prisma db seed', { DATABASE_URL: direct });
run('npx nest build');
