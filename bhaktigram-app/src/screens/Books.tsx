import React, { useEffect, useState } from "react";
import { View, Text, SectionList, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { fetchChapters, groupByCanto, Chapter, BOOKS } from "../books";
import { COLORS } from "../lib";

// Books tab — the Srimad Bhagavatam chapter browser, grouped by canto.
// Tapping a chapter opens the reader (handled by the parent, App.tsx).
export default function Books({ onOpenChapter }: { onOpenChapter: (c: Chapter) => void }) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchChapters()
      .then((c) => alive && setChapters(c))
      .catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Couldn't load chapters.</Text>
        <Text style={styles.errSub}>{error}</Text>
      </View>
    );
  }
  if (!chapters) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.saffron} /></View>;
  }

  const sections = groupByCanto(chapters);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.bookTitle}>{BOOKS[0].title}</Text>
        <Text style={styles.bookSub}>{BOOKS[0].subtitle}</Text>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(c) => String(c.globalNumber)}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={styles.cantoHeader}>Canto {(section as { canto: number }).canto}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} activeOpacity={0.6} onPress={() => onOpenChapter(item)}>
            <View style={styles.chNumWrap}><Text style={styles.chNum}>{item.number}</Text></View>
            <Text style={styles.chTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" },
  err: { color: "#b91c1c", fontWeight: "600", fontSize: 14 },
  errSub: { color: "#9ca3af", fontSize: 11, marginTop: 6, textAlign: "center" },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "#f1f0ee" },
  bookTitle: { fontSize: 22, fontWeight: "700", color: COLORS.saffron },
  bookSub: { fontSize: 12, color: "#8b7355", marginTop: 2 },
  cantoHeader: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: "#a8a29e", backgroundColor: "#faf8f5", paddingHorizontal: 16, paddingVertical: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#f5f4f2" },
  chNumWrap: { width: 30, height: 30, borderRadius: 15, backgroundColor: "#fdf1e7", alignItems: "center", justifyContent: "center" },
  chNum: { fontSize: 12, fontWeight: "700", color: COLORS.saffron },
  chTitle: { flex: 1, fontSize: 14, color: "#3f3f46", lineHeight: 20 },
  chevron: { fontSize: 20, color: "#d6d3d1" },
});
