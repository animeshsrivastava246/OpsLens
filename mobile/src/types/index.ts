export interface UserSession {
  name: string;
  email: string;
  role: string;
  organizationName: string;
}

export interface Site {
  id: string;
  name: string;
}

export interface AssetType {
  id: string;
  name: string;
}

export interface Asset {
  id: string;
  name: string;
  site: { name: string; id?: string };
  assetType: { name: string; id?: string };
}

export interface ActionItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate?: string;
  createdAt: string;
}
