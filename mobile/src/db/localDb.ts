import type * as SQLiteType from 'expo-sqlite';

let SQLite: any = null;
if (typeof window === 'undefined') {
  const sqliteModule = 'expo-sqlite';
  const req = (globalThis as any).nodeRequire || (globalThis as any).require;
  if (req) {
    SQLite = req(sqliteModule);
  }
}

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
  },
  {
    pattern: 'DELETE FROM checklist_templates',
    handler: () => safeStorage.setItem('opslens_templates', JSON.stringify([]))
  },
  {
    pattern: 'INSERT OR REPLACE INTO checklist_templates',
    handler: (params) => {
      const stored = safeStorage.getItem('opslens_templates');
      const list = stored ? JSON.parse(stored) : [];
      const [id, name, schema, organizationId] = params;
      const item = { id, name, schema, organizationId };
      const filtered = list.filter((x: any) => x.id !== id);
      filtered.push(item);
      safeStorage.setItem('opslens_templates', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'DELETE FROM checklist_assignments',
    handler: () => safeStorage.setItem('opslens_assignments', JSON.stringify([]))
  },
  {
    pattern: 'INSERT OR REPLACE INTO checklist_assignments',
    handler: (params) => {
      const stored = safeStorage.getItem('opslens_assignments');
      const list = stored ? JSON.parse(stored) : [];
      const [id, templateId, assetTypeId, organizationId] = params;
      const item = { id, templateId, assetTypeId, organizationId };
      const filtered = list.filter((x: any) => x.id !== id);
      filtered.push(item);
      safeStorage.setItem('opslens_assignments', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'INSERT OR REPLACE INTO checklist_runs',
    handler: (params) => {
      const stored = safeStorage.getItem('opslens_runs');
      const list = stored ? JSON.parse(stored) : [];
      const [id, templateId, assetId, status, createdAt] = params;
      const item = { id, templateId, assetId, status, createdAt };
      const filtered = list.filter((x: any) => x.id !== id);
      filtered.push(item);
      safeStorage.setItem('opslens_runs', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'INSERT OR REPLACE INTO checklist_responses',
    handler: (params) => {
      const stored = safeStorage.getItem('opslens_responses');
      const list = stored ? JSON.parse(stored) : [];
      const [runId, questionId, value] = params;
      const item = { runId, questionId, value };
      const filtered = list.filter((x: any) => !(x.runId === runId && x.questionId === questionId));
      filtered.push(item);
      safeStorage.setItem('opslens_responses', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'DELETE FROM checklist_runs WHERE id = ?',
    handler: (params) => {
      const [id] = params;
      const stored = safeStorage.getItem('opslens_runs');
      const list = stored ? JSON.parse(stored) : [];
      safeStorage.setItem('opslens_runs', JSON.stringify(list.filter((x: any) => x.id !== id)));
    }
  },
  {
    pattern: 'DELETE FROM checklist_responses WHERE runId = ?',
    handler: (params) => {
      const [runId] = params;
      const stored = safeStorage.getItem('opslens_responses');
      const list = stored ? JSON.parse(stored) : [];
      safeStorage.setItem('opslens_responses', JSON.stringify(list.filter((x: any) => x.runId !== runId)));
    }
  },
  {
    pattern: 'DELETE FROM media_upload_queue WHERE id = ?',
    handler: (params) => {
      const [id] = params;
      const stored = safeStorage.getItem('opslens_media_queue');
      const list = stored ? JSON.parse(stored) : [];
      safeStorage.setItem('opslens_media_queue', JSON.stringify(list.filter((x: any) => x.id !== id)));
    }
  },
  {
    pattern: 'INSERT OR REPLACE INTO media_upload_queue',
    handler: (params) => {
      const stored = safeStorage.getItem('opslens_media_queue');
      const list = stored ? JSON.parse(stored) : [];
      const [id, localUri, remoteUrl, status, retryCount, error] = params;
      const item = { id, localUri, remoteUrl, status, retryCount, error };
      const filtered = list.filter((x: any) => x.id !== id);
      filtered.push(item);
      safeStorage.setItem('opslens_media_queue', JSON.stringify(filtered));
    }
  },
  {
    pattern: 'UPDATE media_upload_queue SET status = ?',
    handler: (params) => {
      const [status, error, retryCount, id] = params;
      const stored = safeStorage.getItem('opslens_media_queue');
      const list = stored ? JSON.parse(stored) : [];
      const item = list.find((x: any) => x.id === id);
      if (item) {
        item.status = status;
        item.retryCount = retryCount;
        item.error = error;
        safeStorage.setItem('opslens_media_queue', JSON.stringify(list));
      }
    }
  },
  {
    pattern: 'DELETE FROM media_upload_queue',
    handler: () => safeStorage.setItem('opslens_media_queue', JSON.stringify([]))
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
  },
  {
    pattern: 'FROM media_upload_queue',
    handler: (sql) => {
      const stored = safeStorage.getItem('opslens_media_queue');
      const list = stored ? JSON.parse(stored) : [];
      if (sql.includes("status = 'pending'") || sql.includes("status = 'failed'")) {
        return list.filter((x: any) => x.status === 'pending' || x.status === 'failed');
      }
      return list;
    }
  },
  {
    pattern: 'FROM checklist_templates',
    handler: () => {
      const stored = safeStorage.getItem('opslens_templates');
      return stored ? JSON.parse(stored) : [];
    }
  },
  {
    pattern: 'FROM checklist_assignments',
    handler: () => {
      const stored = safeStorage.getItem('opslens_assignments');
      return stored ? JSON.parse(stored) : [];
    }
  },
  {
    pattern: 'FROM checklist_responses WHERE runId = ?',
    handler: (sql, params) => {
      const [runId] = params;
      const stored = safeStorage.getItem('opslens_responses');
      const list = stored ? JSON.parse(stored) : [];
      return list.filter((x: any) => x.runId === runId);
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
  },
  {
    pattern: 'FROM checklist_runs WHERE id = ?',
    handler: (params) => {
      const [id] = params;
      const stored = safeStorage.getItem('opslens_runs');
      const list = stored ? JSON.parse(stored) : [];
      return list.find((x: any) => x.id === id) || null;
    }
  },
  {
    pattern: "FROM checklist_runs WHERE assetId = ? AND status = 'draft'",
    handler: (params) => {
      const [assetId] = params;
      const stored = safeStorage.getItem('opslens_runs');
      const list = stored ? JSON.parse(stored) : [];
      return list.find((x: any) => x.assetId === assetId && x.status === 'draft') || null;
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

let dbInstance: SQLiteType.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLiteType.SQLiteDatabase> {
  if (typeof window !== 'undefined') {
    if (!dbInstance) {
      dbInstance = new WebDbMock() as any;
    }
    return dbInstance!;
  }
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync('opslens.db');
  }
  return dbInstance!;
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

  // Table for cached checklist templates
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      schema TEXT NOT NULL,
      organizationId TEXT NOT NULL
    );
  `);

  // Table for cached checklist assignments
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS checklist_assignments (
      id TEXT PRIMARY KEY NOT NULL,
      templateId TEXT NOT NULL,
      assetTypeId TEXT,
      organizationId TEXT NOT NULL
    );
  `);

  // Table for cached draft runs
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS checklist_runs (
      id TEXT PRIMARY KEY NOT NULL,
      templateId TEXT NOT NULL,
      assetId TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);

  // Table for cached draft responses
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS checklist_responses (
      runId TEXT NOT NULL,
      questionId TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (runId, questionId)
    );
  `);

  // Table for offline media upload queue
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS media_upload_queue (
      id TEXT PRIMARY KEY NOT NULL,
      localUri TEXT NOT NULL,
      remoteUrl TEXT NOT NULL,
      status TEXT NOT NULL,
      retryCount INTEGER DEFAULT 0,
      error TEXT
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

export async function cacheChecklists(templates: any[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM checklist_templates');
    for (const temp of templates) {
      await db.runAsync(
        'INSERT OR REPLACE INTO checklist_templates (id, name, schema, organizationId) VALUES (?, ?, ?, ?)',
        [temp.id, temp.name, JSON.stringify(temp.schema), temp.organizationId]
      );
    }
  });
}

export async function cacheAssignments(assignments: any[]) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM checklist_assignments');
    for (const ass of assignments) {
      await db.runAsync(
        'INSERT OR REPLACE INTO checklist_assignments (id, templateId, assetTypeId, organizationId) VALUES (?, ?, ?, ?)',
        [ass.id, ass.templateId, ass.assetTypeId || null, ass.organizationId]
      );
    }
  });
}

export async function getCachedChecklists(): Promise<any[]> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM checklist_templates');
  return rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    schema: JSON.parse(row.schema),
    organizationId: row.organizationId
  }));
}

export async function getCachedAssignments(): Promise<any[]> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM checklist_assignments');
  return rows.map((row: any) => ({
    id: row.id,
    templateId: row.templateId,
    assetTypeId: row.assetTypeId,
    organizationId: row.organizationId
  }));
}

export async function saveDraftRun(runId: string, templateId: string, assetId: string | null, status: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO checklist_runs (id, templateId, assetId, status, createdAt) VALUES (?, ?, ?, ?, ?)',
    [runId, templateId, assetId, status, new Date().toISOString()]
  );
}

export async function saveDraftResponses(runId: string, responses: Array<{ questionId: string; value: any }>) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const resp of responses) {
      await db.runAsync(
        'INSERT OR REPLACE INTO checklist_responses (runId, questionId, value) VALUES (?, ?, ?)',
        [runId, resp.questionId, JSON.stringify(resp.value)]
      );
    }
  });
}

export async function getDraftRun(runId: string): Promise<any | null> {
  const db = await getDb();
  const row = await db.getFirstAsync('SELECT * FROM checklist_runs WHERE id = ?', [runId]);
  if (!row) return null;
  const r = row as any;
  return {
    id: r.id,
    templateId: r.templateId,
    assetId: r.assetId,
    status: r.status,
    createdAt: r.createdAt
  };
}

export async function getDraftResponses(runId: string): Promise<Array<{ questionId: string; value: any }>> {
  const db = await getDb();
  const rows = await db.getAllAsync('SELECT * FROM checklist_responses WHERE runId = ?', [runId]);
  return rows.map((row: any) => ({
    questionId: row.questionId,
    value: JSON.parse(row.value)
  }));
}

export async function deleteDraftRun(runId: string) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM checklist_runs WHERE id = ?', [runId]);
    await db.runAsync('DELETE FROM checklist_responses WHERE runId = ?', [runId]);
  });
}

export async function getDraftRunByAssetId(assetId: string): Promise<any | null> {
  const db = await getDb();
  const row = await db.getFirstAsync("SELECT * FROM checklist_runs WHERE assetId = ? AND status = 'draft'", [assetId]);
  if (!row) return null;
  const r = row as any;
  return {
    id: r.id,
    templateId: r.templateId,
    assetId: r.assetId,
    status: r.status,
    createdAt: r.createdAt
  };
}

export async function queueMediaUpload(id: string, localUri: string, remoteUrl: string) {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO media_upload_queue (id, localUri, remoteUrl, status, retryCount) VALUES (?, ?, ?, ?, ?)',
    [id, localUri, remoteUrl, 'pending', 0]
  );
}

export async function getPendingUploads(): Promise<any[]> {
  const db = await getDb();
  const rows = await db.getAllAsync("SELECT * FROM media_upload_queue WHERE status = 'pending' OR status = 'failed' ORDER BY id ASC");
  return rows.map((row: any) => ({
    id: row.id,
    localUri: row.localUri,
    remoteUrl: row.remoteUrl,
    status: row.status,
    retryCount: row.retryCount,
    error: row.error
  }));
}

export async function markUploadCompleted(id: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM media_upload_queue WHERE id = ?', [id]);
}

export async function markUploadFailed(id: string, error: string, retryCount: number) {
  const db = await getDb();
  await db.runAsync(
    'UPDATE media_upload_queue SET status = ?, error = ?, retryCount = ? WHERE id = ?',
    ['failed', error, retryCount, id]
  );
}

export async function clearMediaUploadQueue() {
  const db = await getDb();
  await db.runAsync('DELETE FROM media_upload_queue');
}
