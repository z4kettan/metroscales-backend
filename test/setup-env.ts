// e2e tests run against their own database: TEST_DATABASE_URL, or the dev
// database name with a _test suffix. Run `npm run test:e2e:db` once first.
import { config } from 'dotenv';
config({ path: '.env', quiet: true });
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || (process.env.DATABASE_URL ?? '').replace(/\/([^/?]+)(\?|$)/, '/$1_test$2');
process.env.DEVICE_SIMULATOR = 'true';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.THROTTLE_LIMIT = '10000';
