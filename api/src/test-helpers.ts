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
