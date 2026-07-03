import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet } from "react-native";
import { fetchChapterText, Chapter } from "../books";
import { COLORS } from "../lib";

// Read-only chapter reader. Renders the OCR'd Devanagari text as paragraphs,
// with **bold** inline markers turned into bold runs (matches the web reader's
// source markup). No editing tools — that's a web-only correction workflow.
export default function BookReader({ chapter, onBack }: { chapter: Chapter; onBack: () => void }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setText(null);
    setError(null);
    fetchChapterText(chapter)
      .then((t) => alive && setText(t))
      .catch((e) => alive && setError(String(e)));
    return () => { alive = false; };
  }, [chapter.globalNumber]);

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>‹ Books</Text>
        </TouchableOpacity>
        <Text style={styles.hTitle} numberOfLines={1}>{chapter.title}</Text>
        <View style={styles.headerSpacer} />
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.err}>Couldn't load this chapter.</Text>
          <Text style={styles.errSub}>{error}</Text>
        </View>
      ) : text === null ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.saffron} /></View>
      ) : text.length === 0 ? (
        <View style={styles.center}><Text style={styles.errSub}>No text available for this chapter yet.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <Text style={styles.cantoLabel}>Canto {chapter.skandh} · Chapter {chapter.number}</Text>
          {renderRich(text)}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

// Split into paragraphs (blank-line separated) and render **bold** runs.
function renderRich(text: string): React.ReactNode {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((para, i) => (
    <Text key={i} style={styles.para}>{renderBold(para)}</Text>
  ));
}

function renderBold(s: string): React.ReactNode {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? <Text key={i} style={styles.bold}>{part.slice(2, -2)}</Text>
      : <Text key={i}>{part}</Text>,
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  err: { color: "#b91c1c", fontWeight: "600", fontSize: 14 },
  errSub: { color: "#9ca3af", fontSize: 12, marginTop: 6, textAlign: "center" },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 50,
    borderBottomWidth: 1, borderBottomColor: "#f1f0ee", backgroundColor: "#fff",
  },
  back: { fontSize: 15, fontWeight: "600", color: COLORS.saffron, width: 72 },
  hTitle: { flex: 1, fontSize: 14, fontWeight: "600", color: "#3f3f46", textAlign: "center" },
  headerSpacer: { width: 72 },
  body: { paddingHorizontal: 18, paddingTop: 14 },
  cantoLabel: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: "#a8a29e", marginBottom: 12 },
  para: { fontSize: 17, lineHeight: 30, color: "#292524", marginBottom: 14 },
  bold: { fontWeight: "700", color: "#1c1917" },
});
