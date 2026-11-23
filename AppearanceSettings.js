import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export const defaultAppearance = { font: 'original', accent: 'original', icons: 'right', scale: 100 };

const fontOptions = [
  ['original', 'Фирменный'], ['system', 'Системный'],
  ['serif', 'С засечками'], ['mono', 'Моноширинный'],
];
export const fontFamilies = {
  serif: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  mono: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
};
export const accentColors = {
  peach: '#FFB68D', mint: '#7CE8BC', lilac: '#CBB2FF', blue: '#94CAFF', rose: '#FF9DB4',
};
const accentOptions = [
  ['original', 'Фирменный'], ['peach', 'Персик'], ['mint', 'Мята'],
  ['lilac', 'Сирень'], ['blue', 'Голубой'], ['rose', 'Розовый'],
];
const iconOptions = [['left', 'Слева'], ['right', 'Справа'], ['below', 'Под логотипом']];
const scaleOptions = [90, 100, 110, 120, 130].map(size => [size, `${size}%`]);

export function parseAppearance(raw) {
  const saved = JSON.parse(raw);
  return {
    font: fontOptions.find(([value]) => value === saved?.font)?.[0] ?? defaultAppearance.font,
    accent: accentOptions.find(([value]) => value === saved?.accent)?.[0] ?? defaultAppearance.accent,
    icons: iconOptions.find(([value]) => value === saved?.icons)?.[0] ?? defaultAppearance.icons,
    scale: scaleOptions.find(([value]) => value === saved?.scale)?.[0] ?? defaultAppearance.scale,
  };
}

function ChoiceGroup({ title, options, selected, onChange, swatches }) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.label}>{title}</Text>
      <View style={styles.options}>
        {options.map(([value, label]) => (
          <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: selected === value }}
            onPress={() => onChange(value)}
            style={({ pressed }) => [styles.choice, selected === value && styles.selected, pressed && styles.pressed]}>
            {swatches?.[value] && <View style={[styles.swatch, { backgroundColor: swatches[value] }]} />}
            <Text style={styles.choiceText}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function AppearanceSettings({ appearance, onChange, onClose, accent, previewStyle, supportedOrientations }) {
  return (
    <Modal visible animationType="slide" supportedOrientations={supportedOrientations} onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.screen} accessibilityViewIsModal>
        <View style={[styles.column, styles.header]}>
          <Text accessibilityRole="header" style={styles.title}>Настройки</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={[styles.column, styles.content]}>
          <ChoiceGroup title="Акцентный цвет" options={accentOptions} selected={appearance.accent}
            swatches={{ ...accentColors, original: accent }} onChange={value => onChange({ accent: value })} />
          <ChoiceGroup title="Шрифт" options={fontOptions} selected={appearance.font}
            onChange={value => onChange({ font: value })} />
          <ChoiceGroup title="Размер текста" options={scaleOptions} selected={appearance.scale}
            onChange={value => onChange({ scale: value })} />
          <ChoiceGroup title="Значки соцсетей" options={iconOptions} selected={appearance.icons}
            onChange={value => onChange({ icons: value })} />
          <View style={[styles.preview, { borderColor: accentColors[appearance.accent] ?? accent }]}>
            <Text style={[previewStyle, styles.previewText]}>
              Что приготовим сегодня?
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => onChange(defaultAppearance)} style={styles.reset}>
            <Text style={styles.choiceText}>Сбросить оформление</Text>
          </Pressable>
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.column}>
            <Pressable accessibilityRole="button" onPress={onClose}
              style={({ pressed }) => [styles.done, pressed && styles.pressed]}>
              <Text style={styles.doneText}>Сохранить и выйти</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  scroll: { flex: 1 },
  column: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20 },
  header: { minHeight: 64, justifyContent: 'center', paddingVertical: 8 },
  title: { fontSize: 27, color: '#fff', fontWeight: '700' },
  footer: { flexShrink: 0, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#383838' },
  done: { minHeight: 52, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12,
    paddingVertical: 10, borderRadius: 16, backgroundColor: '#CFFF4A' },
  doneText: { color: '#182000', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  content: { gap: 22, paddingBottom: 24 },
  group: { gap: 9 },
  label: { color: '#fff', fontSize: 16, fontWeight: '600' },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 8, paddingHorizontal: 13,
    paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#383838', backgroundColor: '#151515' },
  selected: { borderColor: '#CFFF4A', backgroundColor: '#242C13' },
  pressed: { opacity: 0.65 },
  choiceText: { color: '#f5f5f5', fontSize: 14 },
  swatch: { width: 14, height: 14, borderRadius: 7 },
  preview: { backgroundColor: '#151515', borderRadius: 16, borderWidth: 1, padding: 16 },
  previewText: { color: '#fff' },
  reset: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
});
