import React from 'react';
import { StyleSheet, View } from 'react-native';

export type TabIconName = 'territories' | 'publishers' | 'history';

interface TabIconProps {
  readonly name: TabIconName;
  readonly color: string;
  readonly size: number;
  readonly focused: boolean;
}

const labelFor: Record<TabIconName, string> = {
  territories: 'Territórios',
  publishers: 'Publicadores',
  history: 'Histórico',
};

/**
 * Bottom-tab glyphs drawn with React Native views instead of an icon font.
 * They therefore ship inside the JavaScript bundle and cannot disappear when
 * an Android device lacks a linked font or a network connection.
 */
export default function TabIcon({ name, color, size, focused }: TabIconProps): React.JSX.Element {
  const stroke = Math.max(1.5, Math.round(size / 12));
  const common = [{ borderColor: color, borderWidth: stroke }, focused ? styles.focused : styles.muted];
  const filled = [{ backgroundColor: color }, focused ? styles.focused : styles.muted];
  const testID = `tab-icon-${name}`;

  return (
    <View
      accessibilityLabel={`Ícone de ${labelFor[name]}`}
      accessible
      style={[styles.canvas, { width: size, height: size }]}
      testID={testID}
    >
      {name === 'territories' && <View style={[styles.territory, common]} />}
      {name === 'publishers' && (
        <>
          <View style={[styles.personHead, filled]} />
          <View style={[styles.personBody, common]} />
        </>
      )}
      {name === 'history' && (
        <>
          <View style={[styles.historyLine, filled]} />
          <View style={[styles.historyLine, styles.historyLineMiddle, filled]} />
          <View style={[styles.historyLine, styles.historyLineBottom, filled]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { alignItems: 'center', justifyContent: 'center' },
  territory: { width: '68%', height: '68%', borderRadius: 3, transform: [{ rotate: '45deg' }] },
  personHead: { width: 7, height: 7, borderRadius: 999, marginBottom: 2 },
  personBody: { width: 14, height: 9, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomWidth: 0 },
  historyLine: { width: '68%', height: 2, borderRadius: 2, marginBottom: 3 },
  historyLineMiddle: { width: '52%' },
  historyLineBottom: { width: '38%', marginBottom: 0 },
  focused: { opacity: 1 },
  muted: { opacity: 0.8 },
});
