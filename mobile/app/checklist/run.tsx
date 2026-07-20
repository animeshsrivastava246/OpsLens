import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView, TextInput, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '../../src/api';
import {
  saveDraftRun,
  saveDraftResponses,
  getDraftResponses,
  deleteDraftRun
} from '../../src/db/localDb';

interface SchemaProperty {
  type: string;
  title: string;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  enum?: string[];
}

interface ChecklistTemplate {
  id: string;
  name: string;
  schema: {
    type: string;
    properties: Record<string, SchemaProperty>;
  };
}

// fallow-ignore-next-line complexity
export default function ChecklistRunScreen() {
  const router = useRouter();
  const { templateId, assetId, runId: searchRunId } = useLocalSearchParams<{ templateId: string; assetId: string; runId?: string }>();

  const [template, setTemplate] = useState<ChecklistTemplate | null>(null);
  const [assetName, setAssetName] = useState<string>('Asset');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string>('');

  // Form states
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (templateId) {
      fetchTemplateAndAsset();
    }
  }, [templateId, assetId]);

  // fallow-ignore-next-line complexity
  const fetchTemplateAndAsset = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch template
      const templates = await api.get('/checklist-templates');
      const foundTemplate = templates.find((t: any) => t.id === templateId);
      if (!foundTemplate) {
        throw new Error('Checklist template not found or unauthorized.');
      }
      setTemplate(foundTemplate);

      // Initialize answers from schema or draft DB
      let initialAnswers: Record<string, any> = {};
      const properties = foundTemplate.schema.properties || {};
      
      let savedResponses: any[] = [];
      let resolvedRunId = searchRunId;

      if (resolvedRunId) {
        try {
          savedResponses = await getDraftResponses(resolvedRunId);
        } catch (dbErr) {
          console.warn('Failed to read draft responses from SQLite:', dbErr);
        }
      }

      if (!resolvedRunId) {
        resolvedRunId = 'run-' + Math.random().toString(36).substring(2, 15);
      }
      setCurrentRunId(resolvedRunId);

      Object.keys(properties).forEach((key) => {
        const saved = savedResponses.find(r => r.questionId === key);
        if (saved !== undefined) {
          initialAnswers[key] = saved.value;
        } else if (properties[key].type === 'boolean') {
          initialAnswers[key] = false;
        } else {
          initialAnswers[key] = '';
        }
      });
      setAnswers(initialAnswers);

      // 2. Fetch asset detail if assetId is provided
      if (assetId) {
        try {
          const asset = await api.get(`/assets/${assetId}`);
          setAssetName(asset.name);
        } catch (assetErr) {
          console.warn('Failed to resolve asset name offline:', assetErr);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to initialize checklist.');
    } finally {
      setLoading(false);
    }
  };

  const handleValueChange = async (key: string, val: any) => {
    const updatedAnswers = { ...answers, [key]: val };
    setAnswers(updatedAnswers);

    try {
      await saveDraftRun(currentRunId, templateId, assetId || null, 'draft');
      const responseList = Object.keys(updatedAnswers).map((k) => ({
        questionId: k,
        value: updatedAnswers[k],
      }));
      await saveDraftResponses(currentRunId, responseList);
    } catch (saveErr) {
      console.warn('Failed to save draft:', saveErr);
    }

    // Clear error for this field
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validateForm = (): boolean => {
    if (!template) return false;
    const errors: Record<string, string> = {};
    const properties = template.schema.properties || {};

    // fallow-ignore-next-line complexity
    Object.keys(properties).forEach((key) => {
      const prop = properties[key];
      const val = answers[key];

      // Required check
      const isRequired = prop.required === true;
      if (isRequired) {
        if (prop.type === 'boolean' && val === undefined) {
          errors[key] = 'This field is required';
        } else if (prop.type !== 'boolean' && (val === undefined || val === null || String(val).trim() === '')) {
          errors[key] = 'This field is required';
        }
      }

      // Numeric range validations
      if (prop.type === 'number' && val !== undefined && val !== null && String(val).trim() !== '') {
        const num = Number(val);
        if (isNaN(num)) {
          errors[key] = 'Must be a valid number';
        } else {
          if (prop.minimum !== undefined && num < prop.minimum) {
            errors[key] = `Value must be at least ${prop.minimum}`;
          }
          if (prop.maximum !== undefined && num > prop.maximum) {
            errors[key] = `Value cannot exceed ${prop.maximum}`;
          }
        }
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // fallow-ignore-next-line complexity
  const handleSubmit = async () => {
    if (!template) return;
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const payloadResponses = Object.keys(answers).map((key) => ({
        questionId: key,
        value: answers[key],
      }));

      await api.post('/checklist-runs', {
        id: currentRunId,
        templateId: template.id,
        assetId: assetId || null,
        responses: payloadResponses,
        status: 'completed',
      });

      try {
        await deleteDraftRun(currentRunId);
      } catch (cleanErr) {
        console.warn('Failed to clean up draft run from local SQLite:', cleanErr);
      }

      // Go back to the asset details or dashboard
      if (assetId) {
        router.navigate(`/asset/${assetId}`);
      } else {
        router.navigate('/');
      }
    } catch (err: any) {
      setError(err.message || 'Submission failed.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>Loading inspection schema...</Text>
      </View>
    );
  }

  if (error && !template) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorTitle}>⚠️ Checklist Load Error</Text>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const safeTemplate = template!;
  const properties = safeTemplate.schema.properties || {};

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.headerCard}>
        <Text style={styles.assetSubtitle}>INSPECTION REPORT FOR</Text>
        <Text style={styles.assetTitle}>{assetName}</Text>
        <View style={styles.divider} />
        <Text style={styles.templateName}>📋 {safeTemplate.name}</Text>
      </View>

      {error && (
        <View style={styles.errorAlert}>
          <Text style={styles.errorAlertText}>⚠️ {error}</Text>
        </View>
      )}

      <View style={styles.formCard}>
        {/* fallow-ignore-next-line complexity */}
        {Object.keys(properties).map((key) => {
          const prop = properties[key];
          const hasError = !!fieldErrors[key];

          return (
            <View key={key} style={styles.fieldContainer}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>
                  {prop.title}
                  {prop.required && <Text style={styles.requiredAsterisk}> *</Text>}
                </Text>
              </View>

              {/* Render dynamic inputs based on schema property type */}
              {prop.type === 'boolean' && (
                <View style={styles.booleanRow}>
                  <Pressable
                    style={[
                      styles.choiceBtn,
                      answers[key] === true && styles.choiceBtnActiveTrue,
                    ]}
                    onPress={() => handleValueChange(key, true)}
                  >
                    <Text style={[styles.choiceBtnText, answers[key] === true && styles.choiceBtnTextActive]}>
                      Yes / Pass
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.choiceBtn,
                      answers[key] === false && styles.choiceBtnActiveFalse,
                    ]}
                    onPress={() => handleValueChange(key, false)}
                  >
                    <Text style={[styles.choiceBtnText, answers[key] === false && styles.choiceBtnTextActive]}>
                      No / Fail
                    </Text>
                  </Pressable>
                </View>
              )}

              {prop.type === 'number' && (
                <TextInput
                  style={[styles.textInput, hasError && styles.textInputError]}
                  value={String(answers[key] ?? '')}
                  onChangeText={(val) => handleValueChange(key, val)}
                  keyboardType="numeric"
                  placeholder={`Enter value ${prop.minimum !== undefined ? `(min: ${prop.minimum})` : ''}`}
                  placeholderTextColor="#64748b"
                />
              )}

              {prop.type === 'string' && prop.enum && (
                <View style={styles.enumContainer}>
                  {prop.enum.map((option) => (
                    <Pressable
                      key={option}
                      style={[
                        styles.enumBtn,
                        answers[key] === option && styles.enumBtnActive,
                      ]}
                      onPress={() => handleValueChange(key, option)}
                    >
                      <Text style={[styles.enumBtnText, answers[key] === option && styles.enumBtnTextActive]}>
                        {option}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {prop.type === 'string' && !prop.enum && (
                <TextInput
                  style={[styles.textInput, hasError && styles.textInputError]}
                  value={answers[key] ?? ''}
                  onChangeText={(val) => handleValueChange(key, val)}
                  placeholder="Enter text observation..."
                  placeholderTextColor="#64748b"
                  multiline={true}
                  numberOfLines={2}
                />
              )}

              {hasError && <Text style={styles.fieldErrorText}>{fieldErrors[key]}</Text>}
            </View>
          );
        })}
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Submit Inspection Checklist</Text>
          )}
        </Pressable>

        <Pressable style={styles.cancelButton} onPress={() => router.back()} disabled={submitting}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
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
  errorTitle: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '700',
  },
  errorText: {
    color: '#cbd5e1',
    fontSize: 14,
    textAlign: 'center',
  },
  backBtn: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 8,
  },
  backBtnText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 13,
  },
  headerCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  assetSubtitle: {
    color: '#38bdf8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  assetTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#1e293b',
    marginVertical: 12,
  },
  templateName: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
  errorAlert: {
    backgroundColor: '#7f1d1d',
    borderColor: '#b91c1c',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  errorAlertText: {
    color: '#fca5a5',
    fontSize: 13,
    fontWeight: '500',
  },
  formCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 20,
  },
  fieldContainer: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fieldLabel: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  requiredAsterisk: {
    color: '#ef4444',
  },
  textInput: {
    backgroundColor: '#020617',
    color: '#f8fafc',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  textInputError: {
    borderColor: '#ef4444',
  },
  booleanRow: {
    flexDirection: 'row',
    gap: 12,
  },
  choiceBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceBtnActiveTrue: {
    backgroundColor: '#064e3b',
    borderColor: '#059669',
  },
  choiceBtnActiveFalse: {
    backgroundColor: '#7f1d1d',
    borderColor: '#dc2626',
  },
  choiceBtnText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  choiceBtnTextActive: {
    color: '#ffffff',
  },
  enumContainer: {
    flexDirection: 'column',
    gap: 8,
  },
  enumBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  enumBtnActive: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
  },
  enumBtnText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '500',
  },
  enumBtnTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  fieldErrorText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '500',
  },
  actionRow: {
    gap: 10,
    marginTop: 8,
  },
  submitButton: {
    backgroundColor: '#0284c7',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#075985',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelButtonText: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
  },
});
