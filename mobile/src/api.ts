// fallow-ignore-file
import {
  getDb,
  getCachedAssets,
  getCachedAssetById,
  cacheAssets,
  queueMutation,
  cacheChecklists,
  cacheAssignments,
  getCachedChecklists,
  getCachedAssignments,
  getPendingUploads,
  markUploadCompleted,
  markUploadFailed
} from './db/localDb';

let isAndroid = false;
let isWeb = typeof window !== 'undefined';

if (typeof window === 'undefined') {
  // Running in Node/Bun tests
} else {
  try {
    const { Platform } = require('react-native');
    isAndroid = Platform.OS === 'android';
    isWeb = Platform.OS === 'web';
  } catch (e) {}
}

// Resolve backend URL based on execution environment
// Android emulator uses 10.0.2.2, iOS/Web use localhost
const getBaseUrl = () => {
  if (isAndroid) {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

export const API_BASE_URL = getBaseUrl();

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let apiToken: string | null = null;
let apiIsOnline = true;

async function getOfflineAsset(id: string): Promise<any> {
  const asset = await getCachedAssetById(id);
  if (!asset) {
    throw new Error('Asset not found offline');
  }
  return asset;
}

async function handleOfflineGet(path: string): Promise<any> {
  if (path === '/assets') {
    return await getCachedAssets();
  }
  if (path.startsWith('/assets/scan/')) {
    return getOfflineAsset(path.substring('/assets/scan/'.length));
  }
  if (path.startsWith('/assets/')) {
    return getOfflineAsset(path.substring('/assets/'.length));
  }
  if (path === '/checklist-templates') {
    const cached = await getCachedChecklists();
    if (cached.length > 0) {
      const assignments = await getCachedAssignments();
      return cached.map((t: any) => ({
        ...t,
        assignments: assignments.filter((a: any) => a.templateId === t.id)
      }));
    }
    return [
      {
        id: 'mock-template-id',
        name: 'Power Generator Safety Check',
        schema: {
          type: 'object',
          properties: {
            pressure: { type: 'number', title: 'System Pressure (PSI)', minimum: 0, maximum: 150, required: true },
            serial_number: { type: 'string', title: 'Serial Number', required: true },
            emergency_stop_ok: { type: 'boolean', title: 'Emergency Stop Functional', required: true },
            general_status: { type: 'string', title: 'Overall Machine Status', enum: ['Good', 'Needs Maintenance', 'Critical Failure'], required: true },
          },
        },
        assignments: [
          {
            id: 'mock-assignment-id',
            templateId: 'mock-template-id',
            assetTypeId: '2235e5ad-0e36-48ef-8ebb-7b5679958794',
          }
        ]
      }
    ];
  }
  if (path === '/my/checklist-runs') {
    return [];
  }
  throw new Error('Offline: API request failed');
}

function getPayload(body: any): any {
  if (!body) {
    return {};
  }
  return JSON.parse(body as string);
}

async function handleOfflineCreate(body: any): Promise<any> {
  const payload = getPayload(body);
  const id = generateUUID();
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO assets (id, name, siteId, siteName, assetTypeId, assetTypeName, organizationId, createdAt) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      payload.name,
      payload.siteId,
      'Offline Site',
      payload.assetTypeId,
      'Offline Asset Type',
      'offline-org',
      new Date().toISOString(),
    ]
  );
  await queueMutation(id, 'asset', 'create', payload);
  return { id, name: payload.name, message: 'Queued offline' };
}

async function handleOfflineUpdate(id: string, body: any): Promise<any> {
  const payload = getPayload(body);
  const db = await getDb();
  await db.runAsync(
    `UPDATE assets SET name = COALESCE(?, name), siteId = COALESCE(?, siteId), assetTypeId = COALESCE(?, assetTypeId) WHERE id = ?`,
    [payload.name ?? null, payload.siteId ?? null, payload.assetTypeId ?? null, id]
  );
  await queueMutation(id, 'asset', 'update', payload);
  return { id, message: 'Update queued offline' };
}

async function handleOfflineDelete(id: string): Promise<any> {
  const db = await getDb();
  await db.runAsync('DELETE FROM assets WHERE id = ?', [id]);
  await queueMutation(id, 'asset', 'delete', {});
  return { id, message: 'Delete queued offline' };
}

async function handleOfflineMutation(path: string, method: string, options: RequestInit): Promise<any> {
  if (method === 'POST') {
    if (path === '/checklist-runs') {
      const payload = getPayload(options.body);
      const id = generateUUID();
      await queueMutation(id, 'checklist-run', 'create', payload);
      return { id, status: 'completed', message: 'Checklist run queued offline' };
    }
    return handleOfflineCreate(options.body);
  }
  const id = path.substring('/assets/'.length);
  if (method === 'PATCH') {
    return handleOfflineUpdate(id, options.body);
  }
  if (method === 'DELETE') {
    return handleOfflineDelete(id);
  }
  throw new Error('Offline: API request failed');
}

async function handleOfflineRequest(path: string, method: string, options: RequestInit): Promise<any> {
  if (method === 'GET') {
    return handleOfflineGet(path);
  }
  if (['POST', 'PATCH', 'DELETE'].includes(method)) {
    return handleOfflineMutation(path, method, options);
  }
  throw new Error('Offline: API request failed');
}

function buildHeaders(optionsHeaders?: HeadersInit): Headers {
  const headers = new Headers(optionsHeaders || {});
  headers.set('Content-Type', 'application/json');
  if (apiToken) {
    headers.set('Authorization', `Bearer ${apiToken}`);
  }
  return headers;
}

async function parseResponse(res: Response): Promise<any> {
  if (res.ok) {
    return res.json();
  }
  let errorMessage = `HTTP Error ${res.status}`;
  try {
    const errData = await res.json();
    errorMessage = errData.error || errorMessage;
  } catch {}
  throw new Error(errorMessage);
}

async function handleOnlineRequest(path: string, method: string, options: RequestInit): Promise<any> {
  const headers = buildHeaders(options.headers);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const data = await parseResponse(res);

    if (method === 'GET') {
      if (path === '/assets') {
        await cacheAssets(data);
      } else if (path === '/checklist-templates') {
        await cacheChecklists(data);
        const assignments = data.flatMap((t: any) => t.assignments || []);
        await cacheAssignments(assignments);
      }
    }

    return data;
  } catch (err: any) {
    console.warn('Network request failed, falling back to offline handling:', err.message);
    apiIsOnline = false;
    return handleOfflineRequest(path, method, options);
  }
}

export const api = {
  setToken(token: string | null) {
    apiToken = token;
  },
  getToken() {
    return apiToken;
  },
  setOnline(online: boolean) {
    apiIsOnline = online;
  },
  getOnline() {
    return apiIsOnline;
  },
  async request(path: string, options: RequestInit = {}): Promise<any> {
    const method = options.method || 'GET';
    if (!apiIsOnline) {
      return handleOfflineRequest(path, method, options);
    }
    return handleOnlineRequest(path, method, options);
  },
  async get(path: string) {
    return this.request(path, { method: 'GET' });
  },
  async post(path: string, body: any) {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  async patch(path: string, body: any) {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  },
  async delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }
};

async function uploadMediaFile(localUri: string, token: string | null): Promise<string> {
  if (isWeb) {
    const filename = localUri.substring(localUri.lastIndexOf('/') + 1) || 'mock.jpg';
    return `https://opslens-assets.s3.amazonaws.com/uploads/${filename}`;
  }

  const FileSystem = require('expo-file-system');
  const response = await FileSystem.uploadAsync(`${API_BASE_URL}/media/upload`, localUri, {
    httpMethod: 'POST',
    uploadType: FileSystem.UploadType.BINARY_CONTENT,
    headers: {
      'Authorization': token ? `Bearer ${token}` : '',
      'Content-Type': 'image/jpeg',
    }
  });

  if (response.status !== 200) {
    throw new Error(`Upload failed with status ${response.status}`);
  }

  const data = JSON.parse(response.body);
  return data.url;
}

export async function flushMediaUploads() {
  const pending = await getPendingUploads();
  
  for (const upload of pending) {
    if (upload.retryCount >= 5) {
      console.warn(`Upload ${upload.id} exceeded maximum retries.`);
      continue;
    }
    try {
      await uploadMediaFile(upload.localUri, apiToken);
      await markUploadCompleted(upload.id);
    } catch (err: any) {
      console.error(`Failed to upload ${upload.id}:`, err.message);
      await markUploadFailed(upload.id, err.message, upload.retryCount + 1);
    }
  }
}
