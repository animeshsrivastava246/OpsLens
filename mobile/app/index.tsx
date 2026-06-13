import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { api, API_BASE_URL } from '../src/api';

interface UserSession {
  name: string;
  email: string;
  role: string;
  organizationName: string;
}

interface Asset {
  id: string;
  name: string;
  site: { name: string };
  assetType: { name: string };
}

function useHomeState() {
  const [session, setSession] = useState<UserSession | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleLogin('worker@acme.com', 'worker123');
  }, []);

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
      await fetchAssetsInternal();
    } catch (err: any) {
      setError(`Login failed: ${err.message}`);
      setSession(null);
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAssetsInternal = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get('/assets');
      setAssets(data);
    } catch (err: any) {
      setError(`Fetch failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    api.setToken(null);
    setSession(null);
    setAssets([]);
  };

  return {
    session,
    assets,
    loading,
    error,
    handleLogin,
    handleLogout,
    fetchAssets: fetchAssetsInternal,
  };
}

export default function HomeDashboard() {
  const { session, assets, loading, error, handleLogin, handleLogout, fetchAssets } = useHomeState();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Platform Info */}
      <View style={styles.platformBadge}>
        <Text style={styles.platformText}>API: {API_BASE_URL}</Text>
      </View>

      {/* Auth State & Switcher */}
      <IdentitySection
        session={session}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />

      {/* Main Actions */}
      <View style={styles.actionRow}>
        <Link href="/scan" asChild>
          <Pressable style={styles.scanActionButton}>
            <Text style={styles.scanActionText}>📷 Scan Asset QR Code</Text>
          </Pressable>
        </Link>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Assets Registry List */}
      <AssetListSection
        session={session}
        assets={assets}
        loading={loading}
        onRefresh={fetchAssets}
      />
    </ScrollView>
  );
}

interface IdentitySectionProps {
  session: UserSession | null;
  onLogin: (email: string, password: string) => void;
  onLogout: () => void;
}

// fallow-ignore-next-line complexity
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

interface AssetListSectionProps {
  session: UserSession | null;
  assets: Asset[];
  loading: boolean;
  onRefresh: () => void;
}

// fallow-ignore-next-line complexity
function AssetListSection({ session, assets, loading, onRefresh }: AssetListSectionProps) {
  return (
    <View style={styles.card}>
      <View style={styles.registryHeader}>
        <Text style={styles.sectionTitle}>Asset Registry</Text>
        {session && (
          <Pressable style={styles.refreshBtn} onPress={onRefresh} disabled={loading}>
            <Text style={styles.refreshBtnText}>{loading ? 'Refreshing...' : '🔄'}</Text>
          </Pressable>
        )}
      </View>

      {loading && assets.length === 0 ? (
        <ActivityIndicator size="large" color="#38bdf8" style={styles.loader} />
      ) : !session ? (
        <Text style={styles.emptyText}>Authenticate to view active tenant registry.</Text>
      ) : assets.length === 0 ? (
        <Text style={styles.emptyText}>No assets found for this tenant registry.</Text>
      ) : (
        <View style={styles.assetList}>
          {assets.map((asset) => (
            <Link key={asset.id} href={`/asset/${asset.id}`} asChild>
              <Pressable style={styles.assetItem}>
                <View style={styles.assetHeader}>
                  <Text style={styles.assetName}>{asset.name}</Text>
                  <Text style={styles.assetTypeBadge}>{asset.assetType.name}</Text>
                </View>
                <Text style={styles.assetLocation}>📍 {asset.site.name}</Text>
                <Text style={styles.assetId}>UUID: {asset.id}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
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
  platformBadge: {
    backgroundColor: '#1e293b',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  platformText: {
    color: '#94a3b8',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  registryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 16,
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
  loginTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
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
    boxShadow: '0 4px 12px rgba(37, 99, 235, 0.4)',
  },
  scanActionText: {
    color: '#ffffff',
    fontSize: 16,
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
  loader: {
    marginVertical: 24,
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginVertical: 24,
    fontSize: 14,
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
    fontSize: 10,
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
    fontSize: 16,
  },
});
