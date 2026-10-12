import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const url = process.env.MIGRATION_DATABASE_URL;
if (!url && process.env.PRISMA_SCHEMA_ONLY !== '1') {
  throw new Error('MIGRATION_DATABASE_URL is required. Use direct or session mode, never transaction pooling.');
}

export default defineConfig({
  schema: 'services/api/prisma/schema.prisma',
  migrations: { path: 'services/api/prisma/migrations' },
  datasource: { url: url ?? 'postgresql://schema_only:unused@127.0.0.1:1/schema_only' },
});
