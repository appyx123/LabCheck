import { createClient } from '@libsql/client/web';
import { wrapClient, type AppDb } from './client';

export function createWebDb(url: string, authToken?: string): AppDb {
  const client = createClient({
    url,
    authToken: authToken || undefined,
  });
  return wrapClient(client);
}
