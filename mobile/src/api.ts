import { Platform } from 'react-native';

// Resolve backend URL based on execution environment
// Android emulator uses 10.0.2.2, iOS/Web use localhost
const getBaseUrl = () => {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:3000';
  }
  return 'http://localhost:3000';
};

export const API_BASE_URL = getBaseUrl();

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken() {
    return this.token;
  }

  // fallow-ignore-next-line complexity
  async request(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errorMessage = `HTTP Error ${res.status}`;
      try {
        const errData = await res.json();
        errorMessage = errData.error || errorMessage;
      } catch {}
      throw new Error(errorMessage);
    }

    return res.json();
  }

  async get(path: string) {
    return this.request(path, { method: 'GET' });
  }

  async post(path: string, body: any) {
    return this.request(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async patch(path: string, body: any) {
    return this.request(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async delete(path: string) {
    return this.request(path, { method: 'DELETE' });
  }
}

export const api = new ApiService();
