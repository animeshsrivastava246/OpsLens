import * as SQLite from 'expo-sqlite';

let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
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
