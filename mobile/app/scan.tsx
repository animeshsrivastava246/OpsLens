import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { api } from '../src/api';

function useScannerState() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [manualCode, setManualCode] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<boolean>(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scanned || loading) return;
    setScanned(true);
    await resolveCode(data);
  };

  const resolveCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const asset = await api.get(`/assets/scan/${trimmed}`);
      router.replace(`/asset/${asset.id}`);
    } catch (err: any) {
      setError(err.message);
      setScanned(false);
    } finally {
      setLoading(false);
    }
  };

  const handleManualResolve = () => {
    resolveCode(manualCode);
  };

  return {
    permission,
    manualCode,
    loading,
    error,
    scanned,
    setManualCode,
    handleBarcodeScanned,
    handleManualResolve,
    requestPermission,
  };
}

export default function QRScanner() {
  const {
    permission,
    manualCode,
    loading,
    error,
    setManualCode,
    handleBarcodeScanned,
    handleManualResolve,
    requestPermission,
  } = useScannerState();

  if (!permission) {
    // Camera permissions are still loading
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Initializing camera permissions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top instruction */}
      <View style={styles.instructionBanner}>
        <Text style={styles.instructionText}>
          Point your camera at an asset QR code, or use the manual entry below.
        </Text>
      </View>

      {/* Camera Viewfinder */}
      <CameraViewfinder
        permission={permission}
        loading={loading}
        onBarcodeScanned={handleBarcodeScanned}
        onRequestPermission={requestPermission}
      />

      {/* Manual Input Fallback */}
      <ManualInputFallback
        manualCode={manualCode}
        loading={loading}
        error={error}
        onCodeChange={setManualCode}
        onResolve={handleManualResolve}
      />
    </View>
  );
}

interface CameraViewfinderProps {
  permission: any;
  loading: boolean;
  onBarcodeScanned: (event: { data: string }) => void;
  onRequestPermission: () => void;
}

interface CameraGrantedViewProps {
  loading: boolean;
  onBarcodeScanned: (event: { data: string }) => void;
}

function LoaderOverlay({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }
  return <ActivityIndicator size="large" color="#ffffff" style={styles.camLoader} />;
}

function CameraGrantedView({ loading, onBarcodeScanned }: CameraGrantedViewProps) {
  return (
    <CameraView
      style={StyleSheet.absoluteFill}
      facing="back"
      onBarcodeScanned={onBarcodeScanned}
      barcodeScannerSettings={{
        barcodeTypes: ['qr'],
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.unfocusedContainer}></View>
        <View style={styles.middleContainer}>
          <View style={styles.unfocusedContainer}></View>
          <View style={styles.viewfinder}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
            <LoaderOverlay show={loading} />
          </View>
          <View style={styles.unfocusedContainer}></View>
        </View>
        <View style={styles.unfocusedContainer}></View>
      </View>
    </CameraView>
  );
}

function PermissionBlockedView({ onRequestPermission }: { onRequestPermission: () => void }) {
  return (
    <View style={styles.permissionBlocked}>
      <Text style={styles.permissionText}>Camera access was denied or is unavailable.</Text>
      <Pressable style={styles.permissionBtn} onPress={onRequestPermission}>
        <Text style={styles.permissionBtnText}>Request Permission</Text>
      </Pressable>
    </View>
  );
}

function CameraViewfinder({ permission, loading, onBarcodeScanned, onRequestPermission }: CameraViewfinderProps) {
  return (
    <View style={styles.scannerContainer}>
      {permission.granted ? (
        <CameraGrantedView loading={loading} onBarcodeScanned={onBarcodeScanned} />
      ) : (
        <PermissionBlockedView onRequestPermission={onRequestPermission} />
      )}
    </View>
  );
}

interface ManualInputFallbackProps {
  manualCode: string;
  loading: boolean;
  error: string | null;
  onCodeChange: (code: string) => void;
  onResolve: () => void;
}

function ErrorMessage({ text }: { text: string | null }) {
  if (!text) {
    return null;
  }
  return <Text style={styles.errorText}>⚠️ {text}</Text>;
}

function ResolveButtonContent({ loading }: { loading: boolean }) {
  if (loading) {
    return <ActivityIndicator size="small" color="#ffffff" />;
  }
  return <Text style={styles.resolveBtnText}>Resolve Asset Context</Text>;
}

interface ResolveButtonProps {
  manualCode: string;
  loading: boolean;
  onPress: () => void;
}

function ResolveButton({ manualCode, loading, onPress }: ResolveButtonProps) {
  const isInputEmpty = !manualCode.trim();
  const isDisabled = isInputEmpty || loading;

  const getButtonStyle = ({ pressed }: { pressed: boolean }) => {
    const list: any[] = [styles.resolveBtn];
    if (pressed) {
      list.push(styles.resolveBtnPressed);
    }
    if (isDisabled) {
      list.push(styles.resolveBtnDisabled);
    }
    return list;
  };

  return (
    <Pressable
      style={getButtonStyle}
      onPress={onPress}
      disabled={isDisabled}
    >
      <ResolveButtonContent loading={loading} />
    </Pressable>
  );
}

function ManualInputFallback({ manualCode, loading, error, onCodeChange, onResolve }: ManualInputFallbackProps) {
  return (
    <View style={styles.manualInputCard}>
      <Text style={styles.manualTitle}>Manual Code Entry</Text>
      <Text style={styles.manualSubtitle}>
        Enter an asset UUID (e.g. from the dashboard list) to simulate a scan.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="e.g. 200a55d0-d369-481d-b847-d42179dc3bbf"
        placeholderTextColor="#64748b"
        value={manualCode}
        onChangeText={onCodeChange}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ErrorMessage text={error} />

      <ResolveButton manualCode={manualCode} loading={loading} onPress={onResolve} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  instructionBanner: {
    backgroundColor: '#0f172a',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: '#1e293b',
  },
  instructionText: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
  },
  scannerContainer: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    minHeight: 250,
  },
  permissionBlocked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  permissionText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
  },
  permissionBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  permissionBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  overlay: {
    flex: 1,
  },
  unfocusedContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  middleContainer: {
    flexDirection: 'row',
    height: 220,
  },
  viewfinder: {
    width: 220,
    height: 220,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camLoader: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 16,
    borderRadius: 8,
  },
  corner: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderColor: '#38bdf8',
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  manualInputCard: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    borderTopWidth: 1,
    borderColor: '#1e293b',
    boxShadow: '0 -4px 10px rgba(0, 0, 0, 0.4)',
  },
  manualTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  manualSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#020617',
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 12,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 13,
    marginBottom: 12,
    fontWeight: '500',
  },
  resolveBtn: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveBtnPressed: {
    opacity: 0.8,
  },
  resolveBtnDisabled: {
    backgroundColor: '#1e293b',
  },
  resolveBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
});
