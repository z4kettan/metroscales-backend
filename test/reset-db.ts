// Recreates the e2e test database from the migrations.
import { execSync } from 'child_process';
import './setup-env';

execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit', env: process.env });
