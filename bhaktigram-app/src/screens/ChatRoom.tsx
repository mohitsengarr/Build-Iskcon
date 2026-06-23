import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, Modal, Alert,
} from "react-native";
import { rest, supabase } from "../supabase";
import {
  Room, ChatMessage, getDeviceId, getAuthor, setAuthor,
  clockTime, dayLabel, nameColor, COLORS,
} from "../lib";

export default function ChatRoom({ room, onBack }: { room: Room; onBack: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [nameModal, setNameModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const scrollRef = useRef<ScrollView | null>(null);

  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const r = await rest(`bhaktigram_chat_messages?room=eq.${encodeURIComponent(room.slug)}&order=created_at.asc&limit=500`);
      if (!r.ok) return;
      const rows = (await r.json()) as ChatMessage[];
      setMessages(prev => (prev.length === rows.length && prev[prev.length - 1]?.id === rows[rows.length - 1]?.id) ? prev : rows);
    } catch { /* offline */ }
  }, [room.slug]);

  const mergeIncoming = useCallback(async (row: ChatMessage) => {
    const dev = await getDeviceId();
    setMessages(prev => {
      if (prev.some(m => m.id === row.id)) return prev;
      if (row.device_id === dev) {
        const idx = prev.findIndex(m => m.device_id === row.device_id && m.body === row.body && m.id > 1e12);
        if (idx >= 0) { const next = prev.slice(); next[idx] = row; return next; }
      }
      return [...prev, row];
    });
  }, []);

  useEffect(() => {
    setMessages([]);
    fetchHistory();
    const channel = supabase
      .channel(`app-chat:${room.slug}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bhaktigram_chat_messages", filter: `room=eq.${room.slug}` },
        (payload) => { void mergeIncoming(payload.new as ChatMessage); },
      )
      .subscribe((status) => { if (status === "SUBSCRIBED") fetchHistory(); });
    const t = setInterval(fetchHistory, 45000);
    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, [fetchHistory, mergeIncoming, room.slug]);

  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(id);
  }, [messages]);

  const doSend = useCallback(async (name: string) => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setDraft("");
    const dev = await getDeviceId();
    const optimistic: ChatMessage = {
      id: Date.now(), room: room.slug, device_id: dev,
      author_name: name, body, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    try {
      const r = await rest("bhaktigram_chat_messages", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ room: room.slug, device_id: dev, author_name: name, body }),
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => "");
        Alert.alert("Message not sent", detail || `HTTP ${r.status}`);
        setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        setDraft(body);
      } else {
        await fetchHistory();
      }
    } catch (err) {
      Alert.alert("Message not sent", "Network error.");
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setDraft(body);
    } finally {
      setSending(false);
    }
  }, [draft, sending, room.slug, fetchHistory]);

  const onSend = useCallback(async () => {
    if (!draft.trim()) return;
    const name = await getAuthor();
    if (!name) { setNameModal(true); return; }
    void doSend(name);
  }, [draft, doSend]);

  // Build render list with day dividers + sender-name grouping.
  const rows: React.ReactNode[] = [];
  let lastDay = "";
  let lastSender = "";
  for (const m of messages) {
    const dl = dayLabel(m.created_at);
    if (dl !== lastDay) {
      rows.push(<View key={`d${m.id}`} style={styles.dayWrap}><Text style={styles.day}>{dl}</Text></View>);
      lastDay = dl; lastSender = "";
    }
    if (m.device_id === "system") {
      rows.push(<View key={`s${m.id}`} style={styles.sysWrap}><Text style={styles.sys}>{m.body}</Text></View>);
      lastSender = "";
      continue;
    }
    const mine = m.device_id === deviceId;
    const showName = !mine && m.author_name !== lastSender;
    rows.push(
      <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowEnd : styles.rowStart]}>
        <View style={[styles.bubble, mine ? styles.sent : styles.received]}>
          {showName && <Text style={[styles.sender, { color: nameColor(m.author_name) }]}>{m.author_name}</Text>}
          <Text style={styles.body}>{m.body}</Text>
          <Text style={styles.meta}>{clockTime(m.created_at)}{mine ? "  ✓✓" : ""}</Text>
        </View>
      </View>,
    );
    lastSender = m.author_name;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}><Text style={styles.backTxt}>‹</Text></TouchableOpacity>
        <View style={styles.headerAvatar}><Text style={styles.headerEmoji}>{room.emoji}</Text></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerName} numberOfLines={1}>{room.name}</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{room.subtitle}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.canvas}
        contentContainerStyle={{ padding: 10, paddingBottom: 16 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {rows}
      </ScrollView>

      <View style={styles.inputBar}>
        <View style={styles.inputPill}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={(t) => setDraft(t.slice(0, 2000))}
            placeholder="Message"
            placeholderTextColor="#9ca3af"
            multiline
          />
        </View>
        <TouchableOpacity onPress={onSend} disabled={sending} style={styles.sendBtn} activeOpacity={0.8}>
          <Text style={styles.sendIcon}>{draft.trim() ? "➤" : "🎤"}</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={nameModal} transparent animationType="fade" onRequestClose={() => setNameModal(false)}>
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose a display name</Text>
            <Text style={styles.modalSub}>So the sangha knows who's speaking. Any name works.</Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={(t) => setNameInput(t.slice(0, 40))}
              placeholder="e.g. Radha Dasi"
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setNameModal(false)}>
                <Text style={styles.modalCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalSave, !nameInput.trim() && { opacity: 0.4 }]}
                disabled={!nameInput.trim()}
                onPress={async () => {
                  const n = nameInput.trim();
                  if (!n) return;
                  await setAuthor(n);
                  setNameModal(false);
                  void doSend(n);
                }}
              >
                <Text style={styles.modalSaveTxt}>Save & Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.wallpaper },
  header: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 6, backgroundColor: COLORS.waHeader },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backTxt: { color: "#fff", fontSize: 34, lineHeight: 36, marginTop: -4 },
  headerAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", marginRight: 8 },
  headerEmoji: { fontSize: 18 },
  headerName: { color: "#fff", fontWeight: "700", fontSize: 15 },
  headerSub: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  canvas: { flex: 1 },
  dayWrap: { alignItems: "center", marginVertical: 8 },
  day: { backgroundColor: "rgba(255,255,255,0.85)", color: "#6b7280", fontSize: 12, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, overflow: "hidden" },
  sysWrap: { alignItems: "center", marginVertical: 6 },
  sys: { backgroundColor: "#ffeeca", color: "#7a5b1e", fontSize: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, maxWidth: "85%", textAlign: "center", overflow: "hidden" },
  bubbleRow: { flexDirection: "row", marginVertical: 2 },
  rowStart: { justifyContent: "flex-start" },
  rowEnd: { justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  sent: { backgroundColor: COLORS.waSent, borderTopRightRadius: 2 },
  received: { backgroundColor: "#fff", borderTopLeftRadius: 2 },
  sender: { fontWeight: "700", fontSize: 12.5, marginBottom: 2 },
  body: { color: "#1f2937", fontSize: 15, lineHeight: 20 },
  meta: { color: "#9ca3af", fontSize: 10.5, alignSelf: "flex-end", marginTop: 2 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 8, backgroundColor: "#f0f2f5" },
  inputPill: { flex: 1, backgroundColor: "#fff", borderRadius: 22, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
  input: { fontSize: 15, color: "#1f2937", paddingVertical: 8, maxHeight: 110 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.waGreen, alignItems: "center", justifyContent: "center" },
  sendIcon: { color: "#fff", fontSize: 18 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, width: "100%", maxWidth: 380 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#1f2937" },
  modalSub: { color: COLORS.muted, fontSize: 13, marginTop: 4, marginBottom: 14 },
  modalInput: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: "#1f2937" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: "center" },
  modalCancel: { backgroundColor: "#f3f4f6" },
  modalCancelTxt: { color: "#4b5563", fontWeight: "600" },
  modalSave: { backgroundColor: COLORS.waGreen },
  modalSaveTxt: { color: "#fff", fontWeight: "700" },
});
