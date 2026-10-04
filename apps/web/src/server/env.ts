import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().default('postgres://party:party@localhost:5432/party_sheet'),
  APP_URL: z.string().default('http://localhost:3000'),
  UPLOAD_DIR: z.string().default('./uploads'),
  LOG_LEVEL: z.string().default('info'),
  NODE_ENV: z.string().default('development'),
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
