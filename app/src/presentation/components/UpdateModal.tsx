import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import type { AppRelease } from '../../domain/appUpdate';
import { colors, radius, spacing } from '../theme';
import { PrimaryButton } from './PrimaryButton';

export interface UpdateModalProps {
  readonly visible: boolean;
  readonly release: AppRelease | null;
  readonly isMandatory: boolean;
  readonly onUpdate: () => void;
  readonly onDismiss?: () => void;
  readonly downloading?: boolean;
  readonly downloadProgress?: number;
  readonly error?: string | null;
}

export function UpdateModal({
  visible,
  release,
  isMandatory,
  onUpdate,
  onDismiss,
  downloading = false,
  downloadProgress = 0,
  error,
}: UpdateModalProps): React.JSX.Element | null {
  if (!visible || !release) {
    return null;
  }

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={isMandatory ? undefined : onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Nova versão disponível</Text>
          <Text style={styles.versionBadge}>Versão {release.versionName}</Text>

          {isMandatory ? (
            <View style={styles.mandatoryNotice}>
              <Text style={styles.mandatoryText}>
                Atualização obrigatória para continuar.
              </Text>
            </View>
          ) : null}

          {release.changelog ? (
            <ScrollView style={styles.changelogScroll} contentContainerStyle={styles.changelogContent}>
              <Text style={styles.changelogTitle}>O que há de novo:</Text>
              <Text style={styles.changelogText}>{release.changelog}</Text>
            </ScrollView>
          ) : null}

          {downloading ? (
            <View style={styles.progressContainer}>
              <View style={styles.progressBarTrack}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${Math.min(Math.max(downloadProgress, 0), 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressText}>
                Baixando atualização... {downloadProgress}%
              </Text>
            </View>
          ) : null}

          {error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              title="Atualizar agora"
              onPress={onUpdate}
              busy={downloading}
              disabled={downloading}
              style={styles.actionButton}
            />

            {!isMandatory && onDismiss && !downloading ? (
              <PrimaryButton
                title="Depois"
                variant="outline"
                onPress={onDismiss}
                style={styles.actionButton}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  versionBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  mandatoryNotice: {
    backgroundColor: colors.warningSurface,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  mandatoryText: {
    fontSize: 13,
    color: colors.warningText,
    textAlign: 'center',
    fontWeight: '500',
  },
  changelogScroll: {
    maxHeight: 140,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  changelogContent: {
    paddingBottom: spacing.xs,
  },
  changelogTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  changelogText: {
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  progressContainer: {
    marginVertical: spacing.md,
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: radius.full,
  },
  progressText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionButton: {
    width: '100%',
  },
});
