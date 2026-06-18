import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { api, API_BASE_URL } from '../src/api';
import { initDb, getQueueCount, getPendingMutations, markMutationSynced, markMutationFailed, clearSyncQueue } from '../src/db/localDb';

interface UserSession {
  name: string;
  email: string;
  role: string;
  organizationName: string;
}

interface Asset {
  id: string;
  name: string;
  site: { name: string; id?: string };
  assetType: { name: string; id?: string };
}

interface Site {
  id: string;
  name: string;
}

interface AssetType {
  id: string;
  name: string;
}

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

  const handleSyncNow = async () => {
    if (!isOnline) {
      setError('Cannot sync while offline. Please connect first.');
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const mutations = await getPendingMutations();
      if (mutations.length > 0) {
        const response = await api.post('/sync/batch', { operations: mutations });
        await processSyncResults(response.results);
        await updateQueueCount();
        await fetchAssets();
      } else {
        setSyncing(false);
      }
    } catch (err: any) {
      setError(`Sync failed: ${err.message}`);
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
  };

  return { session, handleLogin, handleLogout };
}

function useAssetsData(form: ReturnType<typeof useAssetForm>) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAssets = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/assets');
      setAssets(data);
    } catch (err: any) {
      setError(`Fetch assets failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const sitesData = await api.get('/sites');
      const typesData = await api.get('/asset-types');
      setSites(sitesData);
      setAssetTypes(typesData);
      if (sitesData.length > 0) form.setSelectedSiteId(sitesData[0].id);
      if (typesData.length > 0) form.setSelectedTypeId(typesData[0].id);
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
    loading,
    setLoading,
    error,
    setError,
    fetchAssets,
    fetchMetadata,
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

function useHomeState() {
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

function HeaderRow({ isOnline, onToggle }: { isOnline: boolean; onToggle: (online: boolean) => void }) {
  return (
    <View style={styles.headerRow}>
      <View style={styles.platformBadge}>
        <Text style={styles.platformText}>API: {API_BASE_URL}</Text>
      </View>
      <NetworkToggle isOnline={isOnline} onToggle={onToggle} />
    </View>
  );
}

function QrActionSection({ session }: { session: UserSession | null }) {
  if (!session) return null;
  return (
    <View style={styles.actionRow}>
      <Link href="/scan" asChild>
        <Pressable style={styles.scanActionButton}>
          <Text style={styles.scanActionText}>📷 Scan Asset QR Code</Text>
        </Pressable>
      </Link>
    </View>
  );
}

function ErrorSection({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <View style={styles.errorCard}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );
}

export default function HomeDashboard() {
  const state = useHomeState();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <HeaderRow isOnline={state.isOnline} onToggle={state.toggleNetworkMode} />

      <SyncQueueCard
        session={state.session}
        queueCount={state.queueCount}
        syncing={state.syncing}
        isOnline={state.isOnline}
        onSync={state.handleSyncNow}
      />

      <IdentitySection
        session={state.session}
        onLogin={state.handleLogin}
        onLogout={state.handleLogout}
      />

      <QrActionSection session={state.session} />

      <ErrorSection error={state.error} />

      <QuickCreateCard
        session={state.session}
        sites={state.sites}
        isOnline={state.isOnline}
        name={state.newAssetName}
        onNameChange={state.setNewAssetName}
        selectedSiteId={state.selectedSiteId}
        onSiteChange={state.setSelectedSiteId}
        types={state.assetTypes}
        selectedTypeId={state.selectedTypeId}
        onTypeChange={state.setSelectedTypeId}
        onSubmit={state.handleCreateAsset}
        error={state.formError}
      />

      <AssetListSection
        session={state.session}
        assets={state.assets}
        loading={state.loading}
        onRefresh={state.fetchAssets}
      />
    </ScrollView>
  );
}

// Subcomponents

interface NetworkToggleProps {
  isOnline: boolean;
  onToggle: (online: boolean) => void;
}

function getToggleStyle(active: boolean, activeStyle: any) {
  return active ? activeStyle : null;
}

function NetworkToggle({ isOnline, onToggle }: NetworkToggleProps) {
  return (
    <View style={styles.networkToggleContainer}>
      <Text style={styles.networkToggleLabel}>Simulate Connection:</Text>
      <View style={styles.toggleRow}>
        <Pressable
          style={[styles.toggleBtn, getToggleStyle(isOnline, styles.toggleBtnActiveOnline)]}
          onPress={() => onToggle(true)}
        >
          <Text style={[styles.toggleBtnText, getToggleStyle(isOnline, styles.toggleBtnTextActive)]}>Online</Text>
        </Pressable>
        <Pressable
          style={[styles.toggleBtn, getToggleStyle(!isOnline, styles.toggleBtnActiveOffline)]}
          onPress={() => onToggle(false)}
        >
          <Text style={[styles.toggleBtnText, getToggleStyle(!isOnline, styles.toggleBtnTextActive)]}>Offline</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface SyncQueueCardProps {
  session: UserSession | null;
  queueCount: number;
  syncing: boolean;
  isOnline: boolean;
  onSync: () => Promise<void>;
}

function SyncStatusText({ queueCount, hasItems }: { queueCount: number; hasItems: boolean }) {
  if (hasItems) {
    return <Text style={styles.syncCardSubtitle}>{queueCount} pending mutation(s) in local SQLite queue</Text>;
  }
  return <Text style={styles.syncCardSubtitle}>Local SQLite queue is empty. All synced.</Text>;
}

function SyncActionButton({
  syncing,
  isOnline,
  onSync,
}: {
  syncing: boolean;
  isOnline: boolean;
  onSync: () => void;
}) {
  if (syncing) {
    return (
      <Pressable style={styles.syncButton} disabled>
        <ActivityIndicator size="small" color="#ffffff" />
      </Pressable>
    );
  }

  const btnStyle = isOnline ? styles.syncButton : [styles.syncButton, styles.syncButtonDisabled];
  const btnText = isOnline ? '🔄 Reconcile Queue Now' : '⚠️ Offline - Reconnect to Sync';

  return (
    <Pressable style={btnStyle} onPress={onSync} disabled={!isOnline}>
      <Text style={styles.syncButtonText}>{btnText}</Text>
    </Pressable>
  );
}

function PulsingDot({ hasItems }: { hasItems: boolean }) {
  if (!hasItems) return null;
  return <View style={styles.pulsingDot} />;
}

function SyncActionButtonWrapper({
  hasItems,
  syncing,
  isOnline,
  onSync,
}: {
  hasItems: boolean;
  syncing: boolean;
  isOnline: boolean;
  onSync: () => void;
}) {
  if (!hasItems) return null;
  return <SyncActionButton syncing={syncing} isOnline={isOnline} onSync={onSync} />;
}

function getCardStyle(hasItems: boolean) {
  if (hasItems) return [styles.card, styles.syncCard, styles.syncCardPending];
  return [styles.card, styles.syncCard];
}

function SyncQueueCard({ session, queueCount, syncing, isOnline, onSync }: SyncQueueCardProps) {
  if (!session) return null;
  const hasItems = queueCount > 0;

  return (
    <View style={getCardStyle(hasItems)}>
      <View style={styles.syncCardHeader}>
        <View>
          <Text style={styles.syncCardTitle}>Client Sync Center</Text>
          <SyncStatusText queueCount={queueCount} hasItems={hasItems} />
        </View>
        <PulsingDot hasItems={hasItems} />
      </View>
      <SyncActionButtonWrapper hasItems={hasItems} syncing={syncing} isOnline={isOnline} onSync={onSync} />
    </View>
  );
}

interface IdentitySectionProps {
  session: UserSession | null;
  onLogin: (email: string, password: string) => void;
  onLogout: () => void;
}

function IdentitySection({ session, onLogin, onLogout }: IdentitySectionProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Identity & Tenancy</Text>
      {session ? (
        <View style={styles.sessionInfo}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{session.name.charAt(0)}</Text>
            </View>
            <View>
              <Text style={styles.userName}>{session.name}</Text>
              <Text style={styles.userRole}>{session.role.toUpperCase()}</Text>
            </View>
          </View>
          <View style={styles.tenantRow}>
            <Text style={styles.tenantLabel}>Organization:</Text>
            <Text style={styles.tenantValue}>{session.organizationName}</Text>
          </View>
          <Pressable style={styles.logoutButton} onPress={onLogout}>
            <Text style={styles.logoutButtonText}>Disconnect Session</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.loginContainer}>
          <Text style={styles.loginInfo}>Select a credential to simulate login:</Text>
          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.loginBtn, styles.btnAcme]}
              onPress={() => onLogin('worker@acme.com', 'worker123')}
            >
              <Text style={styles.loginBtnText}>Acme Worker</Text>
            </Pressable>
            <Pressable
              style={[styles.loginBtn, styles.btnAdmin]}
              onPress={() => onLogin('admin@acme.com', 'admin123')}
            >
              <Text style={styles.loginBtnText}>Acme Admin</Text>
            </Pressable>
          </View>
          <View style={[styles.buttonRow, { marginTop: 8 }]}>
            <Pressable
              style={[styles.loginBtn, styles.btnGH]}
              onPress={() => onLogin('worker@globalhealth.com', 'worker123')}
            >
              <Text style={styles.loginBtnText}>Global Health Worker</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

interface QuickCreateCardProps {
  session: UserSession | null;
  name: string;
  onNameChange: (text: string) => void;
  sites: Site[];
  selectedSiteId: string;
  onSiteChange: (id: string) => void;
  types: AssetType[];
  selectedTypeId: string;
  onTypeChange: (id: string) => void;
  onSubmit: () => void;
  error: string | null;
  isOnline: boolean;
}

interface DummySelectorProps {
  label: string;
  value: string;
}

function DummySelector({ label, value }: DummySelectorProps) {
  return (
    <View style={styles.selectorHalf}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.dummySelector}>
        <Text style={styles.dummySelectorText}>{value}</Text>
      </View>
    </View>
  );
}

function getSiteName(sites: Site[], id: string): string {
  const site = sites.find((s) => s.id === id);
  return site ? site.name : 'Select Site';
}

function getTypeName(types: AssetType[], id: string): string {
  const type = types.find((t) => t.id === id);
  return type ? type.name : 'Select Type';
}

interface QuickCreateFormFieldsProps {
  name: string;
  onNameChange: (text: string) => void;
  siteName: string;
  typeName: string;
  hasSites: boolean;
  error: string | null;
  isOnline: boolean;
  onSubmit: () => void;
}

function QuickCreateFormFields({
  name,
  onNameChange,
  siteName,
  typeName,
  hasSites,
  error,
  isOnline,
  onSubmit,
}: QuickCreateFormFieldsProps) {
  return (
    <View style={styles.formContainer}>
      <Text style={styles.fieldLabel}>Asset Name</Text>
      <TextInput
        style={styles.textInput}
        value={name}
        onChangeText={onNameChange}
        placeholder="e.g. Ventilation Fan 08"
        placeholderTextColor="#64748b"
      />

      {hasSites ? (
        <View style={styles.selectorPair}>
          <DummySelector label="Site" value={siteName} />
          <DummySelector label="Asset Type" value={typeName} />
        </View>
      ) : (
        <Text style={styles.metadataOfflineText}>
          * Using default local parameters for offline registry entry
        </Text>
      )}

      {error && <Text style={styles.formErrorText}>⚠️ {error}</Text>}

      <Pressable style={styles.submitButton} onPress={onSubmit}>
        <Text style={styles.submitButtonText}>
          {isOnline ? '🚀 Create Asset Registry Entry' : '💾 Queue Asset offline'}
        </Text>
      </Pressable>
    </View>
  );
}

function getHeaderStyle(isOnline: boolean) {
  if (isOnline) return styles.badgeOnline;
  return styles.badgeOffline;
}

function getModeText(isOnline: boolean) {
  if (isOnline) return 'Online mode';
  return 'Offline local-queue';
}

function QuickCreateCard({
  session,
  name,
  onNameChange,
  sites,
  selectedSiteId,
  types,
  selectedTypeId,
  onSubmit,
  error,
  isOnline,
}: QuickCreateCardProps) {
  if (!session) return null;
  if (sites.length === 0 && isOnline) return null;

  return (
    <View style={styles.card}>
      <View style={styles.quickCreateHeader}>
        <Text style={styles.sectionTitle}>Quick Asset Creator</Text>
        <Text style={[styles.modeBadge, getHeaderStyle(isOnline)]}>
          {getModeText(isOnline)}
        </Text>
      </View>
      
      <QuickCreateFormFields
        name={name}
        onNameChange={onNameChange}
        siteName={getSiteName(sites, selectedSiteId)}
        typeName={getTypeName(types, selectedTypeId)}
        hasSites={sites.length > 0}
        error={error}
        isOnline={isOnline}
        onSubmit={onSubmit}
      />
    </View>
  );
}

interface AssetListSectionProps {
  session: UserSession | null;
  assets: Asset[];
  loading: boolean;
  onRefresh: () => void;
}

interface AssetItemProps {
  asset: Asset;
}

function getAssetTypeName(asset: Asset) {
  const type = asset.assetType;
  return type ? type.name || 'Asset' : 'Asset';
}

function getAssetSiteName(asset: Asset) {
  const site = asset.site;
  return site ? site.name || 'Local Store' : 'Local Store';
}

function AssetItem({ asset }: AssetItemProps) {
  return (
    <Link href={`/asset/${asset.id}`} asChild>
      <Pressable style={styles.assetItem}>
        <View style={styles.assetHeader}>
          <Text style={styles.assetName}>{asset.name}</Text>
          <Text style={styles.assetTypeBadge}>{getAssetTypeName(asset)}</Text>
        </View>
        <Text style={styles.assetLocation}>📍 {getAssetSiteName(asset)}</Text>
        <Text style={styles.assetId}>UUID: {asset.id}</Text>
      </Pressable>
    </Link>
  );
}

interface AssetListContentProps {
  session: UserSession | null;
  assets: Asset[];
  loading: boolean;
}

function LoadingIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return <ActivityIndicator size="large" color="#38bdf8" style={styles.loader} />;
}

function EmptyMessage({ show, text }: { show: boolean; text: string }) {
  if (!show) return null;
  return <Text style={styles.emptyText}>{text}</Text>;
}

function AssetList({ show, assets }: { show: boolean; assets: Asset[] }) {
  if (!show) return null;
  return (
    <View style={styles.assetList}>
      {assets.map((asset) => (
        <AssetItem key={asset.id} asset={asset} />
      ))}
    </View>
  );
}

function getListState(session: any, hasAssets: boolean, loading: boolean): 'loading' | 'unauth' | 'empty' | 'list' {
  if (!session) {
    return 'unauth';
  }
  if (hasAssets) {
    return 'list';
  }
  if (loading) {
    return 'loading';
  }
  return 'empty';
}

function AssetListContent({ session, assets, loading }: AssetListContentProps) {
  const state = getListState(session, assets.length > 0, loading);

  return (
    <>
      <LoadingIndicator show={state === 'loading'} />
      <EmptyMessage show={state === 'unauth'} text="Authenticate to view active tenant registry." />
      <EmptyMessage show={state === 'empty'} text="No assets found for this tenant registry." />
      <AssetList show={state === 'list'} assets={assets} />
    </>
  );
}

function AssetListSection({ session, assets, loading, onRefresh }: AssetListSectionProps) {
  const showBtn = session ? true : false;
  const btnText = loading ? '...' : '🔄';

  return (
    <View style={styles.card}>
      <View style={styles.registryHeader}>
        <Text style={styles.sectionTitle}>Asset Registry Cache</Text>
        {showBtn && (
          <Pressable style={styles.refreshBtn} onPress={onRefresh} disabled={loading}>
            <Text style={styles.refreshBtnText}>{btnText}</Text>
          </Pressable>
        )}
      </View>
      <AssetListContent session={session} assets={assets} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  platformBadge: {
    backgroundColor: '#1e293b',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  platformText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  networkToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  networkToggleLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  toggleBtnActiveOnline: {
    backgroundColor: '#059669', // emerald-600
  },
  toggleBtnActiveOffline: {
    backgroundColor: '#dc2626', // red-600
  },
  toggleBtnText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  syncCard: {
    backgroundColor: '#090d16',
    borderColor: '#1e293b',
  },
  syncCardPending: {
    borderColor: '#7f1d1d',
    backgroundColor: '#180f13',
  },
  syncCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  syncCardTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
  },
  syncCardSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  pulsingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
  },
  syncButton: {
    backgroundColor: '#dc2626',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncButtonDisabled: {
    backgroundColor: '#3b0712',
  },
  syncButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
  },
  sessionInfo: {
    marginTop: 12,
    gap: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#38bdf8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#0f172a',
    fontWeight: 'bold',
    fontSize: 18,
  },
  userName: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '600',
  },
  userRole: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  tenantRow: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tenantLabel: {
    color: '#94a3b8',
    fontSize: 13,
  },
  tenantValue: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutButton: {
    backgroundColor: '#334155',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  loginContainer: {
    marginTop: 12,
  },
  loginInfo: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  loginBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnAcme: {
    backgroundColor: '#0369a1',
  },
  btnAdmin: {
    backgroundColor: '#0d9488',
  },
  btnGH: {
    backgroundColor: '#b45309',
  },
  loginBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
  },
  scanActionButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanActionText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  errorCard: {
    backgroundColor: '#7f1d1d',
    borderColor: '#b91c1c',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '500',
  },
  quickCreateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modeBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeOnline: {
    backgroundColor: '#064e3b',
    color: '#a7f3d0',
  },
  badgeOffline: {
    backgroundColor: '#7f1d1d',
    color: '#fca5a5',
  },
  formContainer: {
    gap: 10,
  },
  fieldLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#020617',
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 13,
  },
  selectorPair: {
    flexDirection: 'row',
    gap: 8,
  },
  selectorHalf: {
    flex: 1,
    gap: 4,
  },
  dummySelector: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dummySelectorText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '500',
  },
  metadataOfflineText: {
    color: '#f59e0b',
    fontSize: 10,
    fontStyle: 'italic',
  },
  formErrorText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#0f766e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  registryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  loader: {
    marginVertical: 24,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginVertical: 24,
    fontSize: 13,
  },
  assetList: {
    marginTop: 8,
    gap: 12,
  },
  assetItem: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  assetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  assetName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  assetTypeBadge: {
    color: '#0f172a',
    backgroundColor: '#38bdf8',
    fontSize: 9,
    fontWeight: '700',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    overflow: 'hidden',
  },
  assetLocation: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 6,
  },
  assetId: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  refreshBtn: {
    padding: 4,
  },
  refreshBtnText: {
    fontSize: 14,
    color: '#94a3b8',
  },
});
