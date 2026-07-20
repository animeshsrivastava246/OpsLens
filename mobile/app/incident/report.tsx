import { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { getCachedAssets, queueMutation, getDb } from '../../src/db/localDb';
import { api } from '../../src/api';

interface SimpleAsset {
  id: string;
  name: string;
}

type Severity = 'low' | 'medium' | 'high' | 'critical';

// fallow-ignore-next-line complexity
export default function ReportIncidentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const presetAssetId = params.assetId as string | undefined;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [assets, setAssets] = useState<SimpleAsset[]>([]);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);

  useEffect(() => {
    async function loadAssets() {
      setLoadingAssets(true);
      try {
        const cached = await getCachedAssets();
        setAssets(cached.map((a: any) => ({ id: a.id, name: a.name })));
        if (presetAssetId) {
          setSelectedAssetId(presetAssetId);
        } else if (cached.length > 0) {
          setSelectedAssetId(cached[0].id);
        }
      } catch (err) {
        console.warn('Failed to load assets:', err);
      } finally {
        setLoadingAssets(false);
      }
    }
    loadAssets();
  }, [presetAssetId]);

  // fallow-ignore-next-line complexity
  const handlePickImage = async () => {
    // Request permission first
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please grant photo library access to attach evidence.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };

  // fallow-ignore-next-line complexity
  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Please grant camera access to take a photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  };

  // fallow-ignore-next-line complexity
  const handleSubmit = async () => {
    if (!title.trim()) {
      Alert.alert('Validation Error', 'Incident title is required.');
      return;
    }

    setSubmitting(true);
    try {
      const incidentId = crypto.randomUUID();
      const attachmentId = crypto.randomUUID();
      const filename = `${attachmentId}.jpg`;
      const remoteUrl = `https://opslens-assets.s3.amazonaws.com/uploads/${filename}`;

      // 1. Copy image file locally if on native and image is selected
      let finalLocalUri = imageUri;
      if (imageUri && Platform.OS !== 'web') {
        const FileSystem = require('expo-file-system');
        const localDest = FileSystem.documentDirectory + filename;
        await FileSystem.copyAsync({
          from: imageUri,
          to: localDest
        });
        finalLocalUri = localDest;
      }

      // Prepare attachment list
      const attachments = imageUri ? [{ id: attachmentId, url: remoteUrl }] : [];

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        severity,
        assetId: selectedAssetId || null,
        attachments
      };

      const db = await getDb();
      // SQLite transaction: Queue media upload & Queue incident creation
      await db.withTransactionAsync(async () => {
        // A. Queue media upload if image exists
        if (imageUri && finalLocalUri) {
          await db.runAsync(
            'INSERT OR REPLACE INTO media_upload_queue (id, localUri, remoteUrl, status, retryCount) VALUES (?, ?, ?, ?, ?)',
            [attachmentId, finalLocalUri, remoteUrl, 'pending', 0]
          );
        }

        // B. Queue incident creation
        const syncId = crypto.randomUUID();
        await db.runAsync(
          'INSERT OR REPLACE INTO sync_queue (id, entity, operation, payload, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
          [syncId, 'incident', 'create', JSON.stringify(payload), 'pending', new Date().toISOString()]
        );
      });

      // Flushes offline queue if online
      if (api.getOnline()) {
        const { flushMediaUploads } = require('../../src/api');
        flushMediaUploads().catch(console.warn);
        api.post('/sync/batch', {
          operations: [{
            id: incidentId,
            entity: 'incident',
            operation: 'create',
            payload
          }]
        }).catch(console.warn);
      }

      Alert.alert('Success', 'Incident report submitted successfully.', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (err: any) {
      Alert.alert('Submission Error', `Failed to queue incident: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedAssetName = assets.find(a => a.id === selectedAssetId)?.name || 'None';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Incident Title *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Pump Leaking, Electrical Sparking"
          placeholderTextColor="#64748b"
          value={title}
          onChangeText={setTitle}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Detail the issue, symptoms, and potential impacts..."
          placeholderTextColor="#64748b"
          multiline
          numberOfLines={4}
          value={description}
          onChangeText={setDescription}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Impacted Asset</Text>
        {presetAssetId ? (
          <View style={[styles.input, styles.disabledInput]}>
            <Text style={styles.disabledText}>{selectedAssetName}</Text>
          </View>
        ) : (
          <View style={styles.pickerContainer}>
            {loadingAssets ? (
              <ActivityIndicator color="#3b82f6" />
            ) : (
              assets.map(asset => (
                <TouchableOpacity
                  key={asset.id}
                  style={[
                    styles.assetOption,
                    selectedAssetId === asset.id && styles.assetOptionSelected
                  ]}
                  onPress={() => setSelectedAssetId(asset.id)}
                >
                  <Text
                    style={[
                      styles.assetOptionText,
                      selectedAssetId === asset.id && styles.assetOptionTextSelected
                    ]}
                  >
                    {asset.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Severity Classification</Text>
        <View style={styles.severityContainer}>
          {/* fallow-ignore-next-line complexity */}
          {(['low', 'medium', 'high', 'critical'] as Severity[]).map(sev => {
            const isSelected = severity === sev;
            let sevColor = '#64748b'; // default slate
            if (sev === 'low') sevColor = '#22c55e';
            if (sev === 'medium') sevColor = '#eab308';
            if (sev === 'high') sevColor = '#f97316';
            if (sev === 'critical') sevColor = '#ef4444';

            return (
              <TouchableOpacity
                key={sev}
                style={[
                  styles.severityButton,
                  isSelected && { borderColor: sevColor, backgroundColor: `${sevColor}22` }
                ]}
                onPress={() => setSeverity(sev)}
              >
                <Text
                  style={[
                    styles.severityText,
                    { color: isSelected ? sevColor : '#94a3b8' },
                    isSelected && { fontWeight: '700' }
                  ]}
                >
                  {sev.toUpperCase()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Evidence Attachment (Photo)</Text>
        <View style={styles.photoActions}>
          <TouchableOpacity style={styles.photoButton} onPress={handlePickImage}>
            <Text style={styles.photoButtonText}>Pick from Library</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.photoButton} onPress={handleTakePhoto}>
            <Text style={styles.photoButtonText}>Take Photo</Text>
          </TouchableOpacity>
        </View>

        {imageUri && (
          <View style={styles.previewContainer}>
            <Image source={{ uri: imageUri }} style={styles.previewImage} />
            <TouchableOpacity style={styles.removeButton} onPress={() => setImageUri(null)}>
              <Text style={styles.removeButtonText}>Remove Photo</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Incident Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617', // slate-950
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  fieldGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8', // slate-400
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#0f172a', // slate-900
    borderWidth: 1,
    borderColor: '#334155', // slate-700
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc', // slate-50
    fontSize: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  disabledInput: {
    backgroundColor: '#1e293b', // slate-800
    borderColor: '#334155',
  },
  disabledText: {
    color: '#64748b', // slate-500
    fontSize: 16,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assetOption: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  assetOptionSelected: {
    borderColor: '#3b82f6', // blue-500
    backgroundColor: '#3b82f622',
  },
  assetOptionText: {
    color: '#94a3b8',
    fontSize: 14,
  },
  assetOptionTextSelected: {
    color: '#3b82f6',
    fontWeight: '600',
  },
  severityContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  severityButton: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  severityText: {
    fontSize: 12,
    fontWeight: '500',
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  photoButton: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  photoButtonText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  previewContainer: {
    marginTop: 12,
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 6,
    marginBottom: 12,
  },
  removeButton: {
    backgroundColor: '#ef444422',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  removeButtonText: {
    color: '#ef4444',
    fontWeight: '600',
    fontSize: 14,
  },
  submitButton: {
    backgroundColor: '#3b82f6', // blue-500
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#1d4ed8',
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
