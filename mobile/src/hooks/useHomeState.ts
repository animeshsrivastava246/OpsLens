import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  initDb,
  getQueueCount,
  getPendingMutations,
  markMutationSynced,
  markMutationFailed,
  clearSyncQueue,
  clearMediaUploadQueue,
} from '../db/localDb';
import type { UserSession, Asset, Site, AssetType } from '../types';

function useAssetForm() {
  const [newAssetName, setNewAssetName] = useState<string>('');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  return {
    newAssetName,
    setNewAssetName,
    selectedSiteId,
    setSelectedSiteId,
    selectedTypeId,
    setSelectedTypeId,
    formError,
    setFormError,
  };
}

async function processSyncResults(results: any[]) {
  for (const res of results) {
    if (res.status === 'success') {
      await markMutationSynced(res.id);
    } else {
      await markMutationFailed(res.id, res.error);
    }
  }
}

function useSync(
  isOnline: boolean,
  setError: (err: string | null) => void,
  updateQueueCount: () => Promise<void>,
  fetchAssets: () => Promise<void>
) {
  const [syncing, setSyncing] = useState<boolean>(false);

  useEffect(() => {
    let interval: any;
    if (isOnline) {
      const { flushMediaUploads } = require('../api');
      flushMediaUploads().catch(console.warn);

      interval = setInterval(() => {
        flushMediaUploads().catch(console.warn);
      }, 10000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isOnline]);

  const handleSyncNow = async () => {
    if (!isOnline) {
      setError('Cannot sync while offline. Please connect first.');
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const { flushMediaUploads } = require('../api');
      await flushMediaUploads();

      const mutations = await getPendingMutations();
      if (mutations.length > 0) {
        const response = await api.post('/sync/batch', { operations: mutations });
        await processSyncResults(response.results);
        await updateQueueCount();
        await fetchAssets();
      }
    } catch (err: any) {
      setError(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  return { syncing, handleSyncNow };
}

interface UseAuthProps {
  setLoading: (l: boolean) => void;
  setError: (e: string | null) => void;
  fetchAssets: () => Promise<void>;
  fetchMetadata: () => Promise<void>;
  updateQueueCount: () => Promise<void>;
  setAssets: (assets: Asset[]) => void;
  setSites: (sites: Site[]) => void;
  setAssetTypes: (types: AssetType[]) => void;
  setQueueCount: (c: number) => void;
}

function useAuth(props: UseAuthProps) {
  const {
    setLoading,
    setError,
    fetchAssets,
    fetchMetadata,
    updateQueueCount,
    setAssets,
    setSites,
    setAssetTypes,
    setQueueCount,
  } = props;

  const [session, setSession] = useState<UserSession | null>(null);

  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post('/auth/login', { email, password });
      api.setToken(data.token);
      setSession({
        name: data.user.name,
        email: data.user.email,
        role: data.user.role,
        organizationName: data.user.organization.name,
      });

      await fetchAssets();
      await fetchMetadata();
      await updateQueueCount();
    } catch (err: any) {
      setError(`Login failed: ${err.message}`);
      setSession(null);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setSession(null);
    setAssets([]);
    setSites([]);
    setAssetTypes([]);
    setQueueCount(0);
    clearSyncQueue().catch(console.error);
    clearMediaUploadQueue().catch(console.error);
  };

  return { session, handleLogin, handleLogout };
}

function useAssetsData(form: ReturnType<typeof useAssetForm>) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [compliance, setCompliance] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/assets');
      setAssets(data);
      fetchCompliance().catch(() => {});
    } catch (err: any) {
      setError(`Fetch assets failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompliance = async () => {
    try {
      const summary = await api.get('/reports/compliance-summary');
      setCompliance(summary);
    } catch (_) {}
  };

  const fetchMetadata = async () => {
    try {
      const sitesData = await api.get('/sites');
      const typesData = await api.get('/asset-types');
      setSites(sitesData);
      setAssetTypes(typesData);
      if (sitesData.length > 0) form.setSelectedSiteId(sitesData[0].id);
      if (typesData.length > 0) form.setSelectedTypeId(typesData[0].id);
      await fetchCompliance();
    } catch (err: any) {
      console.warn('Metadata fetch failed (probably offline):', err.message);
    }
  };

  return {
    assets,
    setAssets,
    sites,
    setSites,
    assetTypes,
    setAssetTypes,
    compliance,
    loading,
    setLoading,
    error,
    setError,
    fetchAssets,
    fetchMetadata,
    fetchCompliance,
  };
}

function validateForm(name: string, siteId: string, typeId: string): string | null {
  if (!name.trim()) return 'Asset name is required';
  if (!siteId || !typeId) return 'Site and Asset Type are required';
  return null;
}

function useAssetCreation(
  form: ReturnType<typeof useAssetForm>,
  updateQueueCount: () => Promise<void>,
  fetchAssets: () => Promise<void>
) {
  const handleCreateAsset = async () => {
    const errorMsg = validateForm(form.newAssetName, form.selectedSiteId, form.selectedTypeId);
    form.setFormError(errorMsg);
    if (errorMsg) return;

    try {
      await api.post('/assets', {
        name: form.newAssetName.trim(),
        siteId: form.selectedSiteId,
        assetTypeId: form.selectedTypeId,
      });

      form.setNewAssetName('');
      await updateQueueCount();
      await fetchAssets();
    } catch (err: any) {
      const msg = err.message || 'Failed to create asset';
      form.setFormError(msg);
    }
  };

  return { handleCreateAsset };
}

function useNetwork(data: { fetchAssets: () => void; fetchMetadata: () => void }) {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  const toggleNetworkMode = (online: boolean) => {
    setIsOnline(online);
    api.setOnline(online);
    if (online) {
      data.fetchAssets();
      data.fetchMetadata();
    }
  };

  return { isOnline, toggleNetworkMode };
}

function useBootstrap(
  auth: { handleLogin: (email: string, pass: string) => Promise<void> },
  updateQueueCount: () => Promise<void>
) {
  useEffect(() => {
    const bootstrap = async () => {
      try {
        await initDb();
        await updateQueueCount();
      } catch (err) {
        console.error('Failed to initialize local DB:', err);
      }
    };
    bootstrap();
    auth.handleLogin('worker@acme.com', 'worker123');
  }, []);
}

export function useHomeState() {
  const [queueCount, setQueueCount] = useState<number>(0);

  const form = useAssetForm();
  const data = useAssetsData(form);
  const { isOnline, toggleNetworkMode } = useNetwork(data);

  const updateQueueCount = async () => {
    const count = await getQueueCount();
    setQueueCount(count);
  };

  const auth = useAuth({
    setLoading: data.setLoading,
    setError: data.setError,
    fetchAssets: data.fetchAssets,
    fetchMetadata: data.fetchMetadata,
    updateQueueCount,
    setAssets: data.setAssets,
    setSites: data.setSites,
    setAssetTypes: data.setAssetTypes,
    setQueueCount,
  });

  const { syncing, handleSyncNow } = useSync(
    isOnline,
    data.setError,
    updateQueueCount,
    data.fetchAssets
  );

  const creator = useAssetCreation(form, updateQueueCount, data.fetchAssets);

  useBootstrap(auth, updateQueueCount);

  return {
    ...form,
    ...auth,
    assets: data.assets,
    assetTypes: data.assetTypes,
    sites: data.sites,
    compliance: data.compliance,
    loading: data.loading,
    syncing,
    error: data.error,
    isOnline,
    queueCount,
    fetchAssets: data.fetchAssets,
    toggleNetworkMode,
    handleSyncNow,
    handleCreateAsset: creator.handleCreateAsset,
    updateQueueCount,
  };
}
