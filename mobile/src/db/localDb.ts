import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

const safeStorage = {
  getItem(key: string): string | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  setItem(key: string, value: string): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  }
};

function updateField(obj: any, key: string, val: any) {
  if (val !== null) {
    obj[key] = val;
  }
}

const runHandlers: { pattern: string; handler: (params: any[]) => void }[] = [
  {
    pattern: 'DELETE FROM assets',
    handler: () => safeStorage.setItem('opslens_assets', JSON.stringify([]))
  },
  {
    pattern: 'INSERT OR REPLACE INTO assets',
    handler: (params) => {
      const stored = safeStorage.getItem('opslens_assets');
      const assets = stored ? JSON.parse(stored) : [];
      const [id, name, siteId, siteName, assetTypeId, assetTypeName, organizationId, createdAt] = params;
      const newAsset = { id, name, siteId, siteName, assetTypeId, assetTypeName, organizationId, createdAt };
      const filtered = assets.filter((a: any) => a.id !== id);
      filtered.push(newAsset);
      safeStorage.setItem('opslens_assets', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'UPDATE assets SET',
    handler: (params) => {
      const [name, siteId, assetTypeId, id] = params;
      const stored = safeStorage.getItem('opslens_assets');
      const assets = stored ? JSON.parse(stored) : [];
      const asset = assets.find((a: any) => a.id === id);
      if (asset) {
        updateField(asset, 'name', name);
        updateField(asset, 'siteId', siteId);
        updateField(asset, 'assetTypeId', assetTypeId);
        safeStorage.setItem('opslens_assets', JSON.stringify(assets));
      }
    }
  },
  {
    pattern: 'DELETE FROM assets WHERE id = ?',
    handler: (params) => {
      const [id] = params;
      const stored = safeStorage.getItem('opslens_assets');
      const assets = stored ? JSON.parse(stored) : [];
      safeStorage.setItem('opslens_assets', JSON.stringify(assets.filter((a: any) => a.id !== id)));
    }
  },
  {
    pattern: 'INSERT OR REPLACE INTO sync_queue',
    handler: (params) => {
      const [id, entity, operation, payload, status, createdAt] = params;
      const stored = safeStorage.getItem('opslens_sync_queue');
      const queue = stored ? JSON.parse(stored) : [];
      const newOp = { id, entity, operation, payload, status, createdAt };
      const filtered = queue.filter((q: any) => q.id !== id);
      filtered.push(newOp);
      safeStorage.setItem('opslens_sync_queue', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'DELETE FROM sync_queue WHERE id = ?',
    handler: (params) => {
      const [id] = params;
      const stored = safeStorage.getItem('opslens_sync_queue');
      const queue = stored ? JSON.parse(stored) : [];
      safeStorage.setItem('opslens_sync_queue', JSON.stringify(queue.filter((q: any) => q.id !== id)));
    }
  },
  {
    pattern: 'UPDATE sync_queue SET status = ?',
    handler: (params) => {
      const [status, error, id] = params;
      const stored = safeStorage.getItem('opslens_sync_queue');
      const queue = stored ? JSON.parse(stored) : [];
      const op = queue.find((q: any) => q.id === id);
      if (op) {
        op.status = status;
        op.error = error;
        safeStorage.setItem('opslens_sync_queue', JSON.stringify(queue));
      }
    }
  },
  {
    pattern: 'DELETE FROM sync_queue',
    handler: () => safeStorage.setItem('opslens_sync_queue', JSON.stringify([]))
  }
];

const allHandlers: { pattern: string; handler: (sql: string, params: any[]) => any[] }[] = [
  {
    pattern: 'FROM assets',
    handler: () => {
      const stored = safeStorage.getItem('opslens_assets');
      return stored ? JSON.parse(stored) : [];
    }
  },
  {
    pattern: 'FROM sync_queue',
    handler: (sql) => {
      const stored = safeStorage.getItem('opslens_sync_queue');
      const queue = stored ? JSON.parse(stored) : [];
      if (sql.includes("status = 'pending'")) {
        return queue.filter((q: any) => q.status === 'pending');
      }
      return queue;
    }
  }
];

const firstHandlers: { pattern: string; handler: (params: any[]) => any }[] = [
  {
    pattern: 'FROM assets WHERE id = ?',
    handler: (params) => {
      const [id] = params;
      const stored = safeStorage.getItem('opslens_assets');
      const assets = stored ? JSON.parse(stored) : [];
      return assets.find((a: any) => a.id === id) || null;
    }
  },
  {
    pattern: 'SELECT COUNT(*)',
    handler: () => {
      const stored = safeStorage.getItem('opslens_sync_queue');
      const queue = stored ? JSON.parse(stored) : [];
      const count = queue.filter((q: any) => q.status === 'pending').length;
      return { count };
    }
  }
];

class WebDbMock {
  async execAsync(sql: string) {
    // Schema creation, no-op
  }
  async withTransactionAsync(callback: () => Promise<void>) {
    await callback();
  }
  async runAsync(sql: string, params: any[] = []) {
    const matched = runHandlers.find(h => sql.includes(h.pattern));
    if (matched) {
      matched.handler(params);
    }
  }
  async getAllAsync(sql: string, params: any[] = []): Promise<any[]> {
    const matched = allHandlers.find(h => sql.includes(h.pattern));
    return matched ? matched.handler(sql, params) : [];
  }
  async getFirstAsync(sql: string, params: any[] = []): Promise<any | null> {
    const matched = firstHandlers.find(h => sql.includes(h.pattern));
    return matched ? matched.handler(params) : null;
  }
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (Platform.OS === 'web') {
    if (!dbInstance) {
      dbInstance = new WebDbMock() as any;
    }
    return dbInstance!;
  }
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('opslens.db');
  }
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();
  
  // Table for cached assets
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      siteId TEXT NOT NULL,
      siteName TEXT NOT NULL,
      assetTypeId TEXT NOT NULL,
      assetTypeName TEXT NOT NULL,
      organizationId TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  // Table for offline mutation queue
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY NOT NULL,
      entity TEXT NOT NULL,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      error TEXT,
      createdAt TEXT NOT NULL
    );
  `);
}

function getVal(obj: any, key: string): string {
  if (!obj) return '';
  return obj[key] ?? '';
}

function getCreatedAt(asset: any): string {
  return asset.createdAt ?? new Date().toISOString();
}

function mapAssetToDbRow(asset: any): any[] {
  return [
    asset.id,
    asset.name,
    getVal(asset.site, 'id'),
    getVal(asset.site, 'name'),
    getVal(asset.assetType, 'id'),
    getVal(asset.assetType, 'name'),
    getVal(asset, 'organizationId'),
    getCreatedAt(asset)
  ];
}

export async function cacheAssets(assets: any[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM assets');
    for (const asset of assets) {
      await db.runAsync(
        `INSERT OR REPLACE INTO assets (id, name, siteId, siteName, assetTypeId, assetTypeName, organizationId, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        mapAssetToDbRow(asset)
      );
    }
  });
}

export async function getCachedAssets() {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM assets');
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    organizationId: row.organizationId,
    createdAt: row.createdAt,
    site: { id: row.siteId, name: row.siteName },
    assetType: { id: row.assetTypeId, name: row.assetTypeName }
  }));
}

export async function getCachedAssetById(id: string) {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM assets WHERE id = ?', [id]);
  if (!row) return null;
  const r = row as any;
  return {
    id: r.id,
    name: r.name,
    organizationId: r.organizationId,
    createdAt: r.createdAt,
    site: { id: r.siteId, name: r.siteName },
    assetType: { id: r.assetTypeId, name: r.assetTypeName }
  };
}

export async function queueMutation(id: string, entity: string, operation: string, payload: any) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO sync_queue (id, entity, operation, payload, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
    [
      id,
      entity,
      operation,
      JSON.stringify(payload),
      'pending',
      new Date().toISOString()
    ]
  );
}

export async function getPendingMutations() {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY createdAt ASC");
  return rows.map((row: any) => ({
    id: row.id,
    entity: row.entity,
    operation: row.operation,
    payload: JSON.parse(row.payload),
    status: row.status,
    error: row.error,
    createdAt: row.createdAt
  }));
}

export async function markMutationSynced(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_queue WHERE id = ?', [id]);
}

export async function markMutationFailed(id: string, error: string) {
  const db = await getDb();
  await db.runAsync('UPDATE sync_queue SET status = ?, error = ? WHERE id = ?', ['failed', error, id]);
}

export async function getQueueCount(): Promise<number> {
  const db = await getDb();
  try {
    const res: any = await db.getFirstAsync("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'");
    return res ? res.count : 0;
  } catch {
    return 0;
  }
}

export async function clearSyncQueue() {
  const db = await getDb();
  await db.runAsync('DELETE FROM sync_queue');
}
