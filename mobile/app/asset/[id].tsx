import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api';

interface AssetDetail {
  id: string;
  name: string;
  organizationId: string;
  createdAt: string;
  site: {
    id: string;
    name: string;
  };
  assetType: {
    id: string;
    name: string;
  };
}

function useAssetDetailsState(id: string | undefined) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchAssetDetails();
    }
  }, [id]);

  const fetchAssetDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/assets/${id}`);
      setAsset(data);
    } catch (err: any) {
      setError(err.message || 'Asset details could not be retrieved.');
    } finally {
      setLoading(false);
    }
  };

  return { asset, loading, error };
}

// fallow-ignore-next-line complexity
export default function AssetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { asset, loading, error } = useAssetDetailsState(id);

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Fetching asset specifications...</Text>
      </View>
    );
  }

  if (error || !asset) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>⚠️ Resolution Error</Text>
        <Text style={styles.errorDesc}>{error || 'Asset not found in active tenancy context.'}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.replace('/')}>
          <Text style={styles.backBtnText}>Return to Dashboard</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header Info */}
      <AssetHeroCard asset={asset} />

      {/* Asset Specifications */}
      <AssetSpecsCard asset={asset} />

      {/* Available Workflow Actions */}
      <AssetWorkflowsCard />

      {/* Navigation Return */}
      <Pressable style={styles.returnButton} onPress={() => router.navigate('/')}>
        <Text style={styles.returnButtonText}>Back to Dashboard</Text>
      </Pressable>
    </ScrollView>
  );
}

interface SubComponentProps {
  asset: AssetDetail;
}

// fallow-ignore-next-line complexity
function AssetHeroCard({ asset }: SubComponentProps) {
  return (
    <View style={styles.heroCard}>
      <View style={styles.typeBadgeContainer}>
        <Text style={styles.typeBadge}>{asset.assetType.name}</Text>
      </View>
      <Text style={styles.assetName}>{asset.name}</Text>
      <Text style={styles.siteText}>📍 {asset.site.name}</Text>
    </View>
  );
}

// fallow-ignore-next-line complexity
function AssetSpecsCard({ asset }: SubComponentProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Asset Specifications</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Asset ID (UUID)</Text>
        <Text style={[styles.infoValue, styles.monospace]} selectable>{asset.id}</Text>
      </View>

      <View style={styles.infoDivider} />

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Organization ID</Text>
        <Text style={[styles.infoValue, styles.monospace]} selectable>{asset.organizationId}</Text>
      </View>

      <View style={styles.infoDivider} />

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Registered On</Text>
        <Text style={styles.infoValue}>
          {new Date(asset.createdAt).toLocaleDateString()} at{' '}
          {new Date(asset.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>

      <View style={styles.infoDivider} />

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Registry Status</Text>
        <View style={styles.statusContainer}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>ACTIVE & ENROLLED</Text>
        </View>
      </View>
    </View>
  );
}

// fallow-ignore-next-line complexity
function AssetWorkflowsCard() {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Operational Workflows</Text>
      <Text style={styles.workflowDesc}>
        Execute localized inspections and capture incident logs for this asset.
      </Text>

      <View style={styles.workflowButtons}>
        <Pressable style={[styles.workflowBtn, styles.btnInspection]}>
          <Text style={styles.workflowBtnText}>📋 Start Inspection Checklist</Text>
        </Pressable>

        <Pressable style={[styles.workflowBtn, styles.btnIncident]}>
          <Text style={styles.workflowBtnText}>⚠️ Report Asset Incident</Text>
        </Pressable>
      </View>
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
  centerContainer: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '700',
  },
  errorDesc: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 8,
  },
  backBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  heroCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: '#1e293b',
    alignItems: 'center',
    gap: 8,
  },
  typeBadgeContainer: {
    backgroundColor: '#0369a1',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  typeBadge: {
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  assetName: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  siteText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 16,
  },
  infoRow: {
    gap: 4,
  },
  infoLabel: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
  },
  infoValue: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  monospace: {
    fontFamily: 'monospace',
    fontSize: 13,
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 12,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '700',
  },
  workflowDesc: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 16,
  },
  workflowButtons: {
    gap: 10,
  },
  workflowBtn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnInspection: {
    backgroundColor: '#0284c7',
  },
  btnIncident: {
    backgroundColor: '#b91c1c',
  },
  workflowBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
  returnButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  returnButtonText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 14,
  },
});
