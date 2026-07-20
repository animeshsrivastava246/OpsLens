import { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/api';
import { getDraftRunByAssetId } from '../../src/db/localDb';

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

async function fetchActiveDraft(assetId: string): Promise<any | null> {
  try {
    return await getDraftRunByAssetId(assetId);
  } catch (err) {
    console.warn('Failed to resolve active draft runs:', err);
    return null;
  }
}

async function fetchAssignedTemplate(assetTypeId: string): Promise<any | null> {
  try {
    const templates = await api.get('/checklist-templates');
    return templates.find((t: any) =>
      (t.assignments || []).some((a: any) => a.assetTypeId === assetTypeId)
    ) || null;
  } catch (err) {
    console.warn('Failed to resolve checklist assignments:', err);
    return null;
  }
}

function useAssetDetailsState(id: string | undefined) {
  const [asset, setAsset] = useState<AssetDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [assignedTemplate, setAssignedTemplate] = useState<any | null>(null);
  const [activeDraft, setActiveDraft] = useState<any | null>(null);

  useEffect(() => {
    if (id) {
      fetchAssetDetails();
    }
  }, [id]);

  // fallow-ignore-next-line complexity
  const fetchAssetDetails = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get(`/assets/${id}`);
      setAsset(data);
      if (data) {
        const draft = await fetchActiveDraft(id as string);
        setActiveDraft(draft);

        if (data.assetType) {
          const template = await fetchAssignedTemplate(data.assetType.id);
          setAssignedTemplate(template);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Asset details could not be retrieved.');
    } finally {
      setLoading(false);
    }
  };

  return { asset, loading, error, assignedTemplate, activeDraft };
}

function LoadingOverlay() {
  return (
    <View style={styles.centerContainer}>
      <ActivityIndicator size="large" color="#38bdf8" />
      <Text style={styles.loadingText}>Fetching asset specifications...</Text>
    </View>
  );
}

interface ErrorOverlayProps {
  error: string | null;
  onBack: () => void;
}

function ErrorOverlay({ error, onBack }: ErrorOverlayProps) {
  const displayError = error ?? 'Asset not found in active tenancy context.';
  return (
    <View style={styles.centerContainer}>
      <Text style={styles.errorText}>⚠️ Resolution Error</Text>
      <Text style={styles.errorDesc}>{displayError}</Text>
      <Pressable style={styles.backBtn} onPress={onBack}>
        <Text style={styles.backBtnText}>Return to Dashboard</Text>
      </Pressable>
    </View>
  );
}

function getDetailState(loading: boolean, error: string | null, asset: any): 'loading' | 'error' | 'success' {
  if (loading) {
    return 'loading';
  }
  if (error) {
    return 'error';
  }
  if (!asset) {
    return 'error';
  }
  return 'success';
}

export default function AssetDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { asset, loading, error, assignedTemplate, activeDraft } = useAssetDetailsState(id);

  const screenState = getDetailState(loading, error, asset);

  if (screenState === 'loading') {
    return <LoadingOverlay />;
  }

  if (screenState === 'error') {
    return <ErrorOverlay error={error} onBack={() => router.replace('/')} />;
  }

  const safeAsset = asset!;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header Info */}
      <AssetHeroCard asset={safeAsset} />

      {/* Asset Specifications */}
      <AssetSpecsCard asset={safeAsset} />

      {/* Available Workflow Actions */}
      <AssetWorkflowsCard assetId={safeAsset.id} assignedTemplate={assignedTemplate} activeDraft={activeDraft} />

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

function OfflineBadge({ isOnline }: { isOnline: boolean }) {
  if (isOnline) {
    return null;
  }
  return (
    <View style={styles.offlineBadgeContainer}>
      <Text style={styles.offlineBadge}>Offline Cache</Text>
    </View>
  );
}

function AssetHeroCard({ asset }: SubComponentProps) {
  const isOnline = api.getOnline();
  return (
    <View style={styles.heroCard}>
      <View style={styles.badgeRow}>
        <View style={styles.typeBadgeContainer}>
          <Text style={styles.typeBadge}>{asset.assetType.name}</Text>
        </View>
        <OfflineBadge isOnline={isOnline} />
      </View>
      <Text style={styles.assetName}>{asset.name}</Text>
      <Text style={styles.siteText}>📍 {asset.site.name}</Text>
    </View>
  );
}

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
function AssetWorkflowsCard({
  assetId,
  assignedTemplate,
  activeDraft,
}: {
  assetId: string;
  assignedTemplate: any | null;
  activeDraft: any | null;
}) {
  const router = useRouter();

  const handleStartInspection = () => {
    if (assignedTemplate) {
      router.navigate({
        pathname: '/checklist/run',
        params: {
          templateId: assignedTemplate.id,
          assetId,
          runId: activeDraft ? activeDraft.id : undefined,
        },
      });
    }
  };

  const hasTemplate = !!assignedTemplate;
  const hasDraft = !!activeDraft;

  let workflowDesc = 'No checklist assigned for this asset type.';
  if (hasDraft) {
    workflowDesc = `Draft in progress: ${assignedTemplate?.name || 'Checklist'}`;
  } else if (hasTemplate) {
    workflowDesc = `Assigned: ${assignedTemplate.name}`;
  }

  let buttonText = '📋 No Checklist Assigned';
  if (hasDraft) {
    buttonText = '📋 Resume Inspection Draft';
  } else if (hasTemplate) {
    buttonText = '📋 Start Assigned Checklist';
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Operational Workflows</Text>
      <Text style={styles.workflowDesc}>{workflowDesc}</Text>

      <View style={styles.workflowButtons}>
        <Pressable
          style={[
            styles.workflowBtn,
            styles.btnInspection,
            !hasTemplate && styles.btnInspectionDisabled,
            hasDraft && styles.btnDraftResume,
          ]}
          onPress={handleStartInspection}
          disabled={!hasTemplate}
        >
          <Text style={styles.workflowBtnText}>{buttonText}</Text>
        </Pressable>

        <Pressable
          style={[styles.workflowBtn, styles.btnIncident]}
          onPress={() => router.push(`/incident/report?assetId=${assetId}`)}
        >
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
  btnDraftResume: {
    backgroundColor: '#d97706',
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
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  offlineBadgeContainer: {
    backgroundColor: '#7f1d1d',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 99,
  },
  offlineBadge: {
    color: '#fca5a5',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
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
  btnInspectionDisabled: {
    backgroundColor: '#0f2c3d',
    opacity: 0.6,
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
