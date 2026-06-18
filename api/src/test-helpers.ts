import crypto from 'crypto';
const baseUrl = 'http://localhost:3000';

export const post = async (path: string, body: any, token?: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
};

export const patch = async (path: string, body: any, token?: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as any };
};

export const del = async (path: string, token?: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'DELETE',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  });
  return { status: res.status, data: (await res.json()) as any };
};

export const get = async (path: string, token?: string) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  });
  return { status: res.status, data: (await res.json()) as any };
};

export function generateUUID() {
  return crypto.randomUUID();
}

function assertResponse(res: any, name: string) {
  if (res.status !== 200) {
    throw new Error(`Could not fetch ${name}: ${res.status}`);
  }
}

function assertNotEmpty(arr: any[], name: string) {
  if (arr.length === 0) {
    throw new Error(`Seeding is incomplete; no ${name} found.`);
  }
}

export async function fetchTestMetadata(token: string) {
  const sitesRes = await get('/sites', token);
  const typesRes = await get('/asset-types', token);

  assertResponse(sitesRes, 'sites');
  assertResponse(typesRes, 'asset types');

  const sites = sitesRes.data;
  const types = typesRes.data;
  
  assertNotEmpty(sites, 'sites');
  assertNotEmpty(types, 'asset types');

  const siteId = sites[0].id;
  const assetTypeId = types[0].id;

  return { siteId, assetTypeId, sitesCount: sites.length, typesCount: types.length };
}
