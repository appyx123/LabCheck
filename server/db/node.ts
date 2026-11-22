import { createClient, type Client } from '@libsql/client';
import { ensureSchema, wrapClient, type AppDb } from './client';

export async function createNodeDb(url: string, authToken?: string): Promise<{ db: AppDb; client: Client }> {
  const client = createClient({
    url,
    authToken: authToken || undefined,
  });
  await ensureSchema(client);
  return { db: wrapClient(client), client };
}
