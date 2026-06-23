import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { rest, supabase } from "../supabase";
import { ROOMS, Room, ChatMessage, listTime, getDeviceId, COLORS } from "../lib";

export default function ChatList({ onOpenRoom }: { onOpenRoom: (room: Room) => void }) {
  const [latest, setLatest] = useState<Record<string, ChatMessage>>({});
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  const fetchOverview = useCallback(async () => {
    try {
      const r = await rest("bhaktigram_chat_messages?select=*&order=created_at.desc&limit=300");
      if (!r.ok) return;
      const rows = (await r.json()) as ChatMessage[];
      const last: Record<string, ChatMessage> = {};
      for (const m of rows) if (!last[m.room]) last[m.room] = m;
      setLatest(last);
    } catch { /* offline */ }
  }, []);

  // Realtime: bump previews the moment any message lands; 45s poll is fallback.
  useEffect(() => {
    fetchOverview();
    const channel = supabase
      .channel("app-chat-overview")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bhaktigram_chat_messages" }, () => fetchOverview())
      .subscribe((status) => { if (status === "SUBSCRIBED") fetchOverview(); });
    const t = setInterval(fetchOverview, 45000);
    return () => { clearInterval(t); supabase.removeChannel(channel); };
  }, [fetchOverview]);

  const renderItem = useCallback(({ item }: { item: Room }) => {
    const m = latest[item.slug];
    const preview = m
      ? (m.device_id === "system" ? m.body : `${m.author_name.split(" ")[0]}: ${m.body}`)
      : "Tap to start the conversation";
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => onOpenRoom(item)}>
        <View style={[styles.avatar, { backgroundColor: item.accent + "22" }]}>
          <Text style={styles.emoji}>{item.emoji}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTop}>
            <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
            {m && <Text style={styles.time}>{listTime(m.created_at)}</Text>}
          </View>
          <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
        </View>
      </TouchableOpacity>
    );
  }, [latest, onOpenRoom]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.brand}>Bhaktigram</Text>
        <Text style={styles.brandSub}>Chat</Text>
      </View>
      <Text style={styles.hint}>Community sangha rooms · anyone can join</Text>
      <FlatList data={ROOMS} keyExtractor={r => r.slug} renderItem={renderItem} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { height: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 6, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eee" },
  brand: { fontSize: 20, fontWeight: "800", color: COLORS.waGreen },
  brandSub: { fontSize: 20, fontWeight: "700", color: "#9ca3af" },
  hint: { color: "#9ca3af", fontSize: 12, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 26 },
  rowBody: { flex: 1, borderBottomWidth: 1, borderBottomColor: "#f0f0f0", paddingBottom: 12 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "700", color: COLORS.ink, fontSize: 15, flex: 1, marginRight: 8 },
  time: { color: "#9ca3af", fontSize: 12 },
  preview: { color: COLORS.muted, fontSize: 13, marginTop: 2 },
});
