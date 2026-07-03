import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Feed from "./src/screens/Feed";
import ChatList from "./src/screens/ChatList";
import ChatRoom from "./src/screens/ChatRoom";
import Books from "./src/screens/Books";
import BookReader from "./src/screens/BookReader";
import { Room, COLORS } from "./src/lib";
import { Chapter } from "./src/books";

// Deliberately no navigation library — the surface is small (Feed, Books, Chat),
// so plain state switching keeps the dependency tree minimal and the APK build
// low-risk.
type Tab = "feed" | "books" | "chat";

export default function App() {
  const [tab, setTab] = useState<Tab>("feed");
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);

  // A book chapter takes over the whole screen (its own header + back).
  if (activeChapter) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
          <BookReader chapter={activeChapter} onBack={() => setActiveChapter(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  // A room conversation takes over the whole screen (its own header + back).
  if (activeRoom) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
          <ChatRoom room={activeRoom} onBack={() => setActiveRoom(null)} />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.flex} edges={["top"]}>
        <View style={styles.flex}>
          {tab === "feed"
            ? <Feed />
            : tab === "books"
              ? <Books onOpenChapter={(c) => setActiveChapter(c)} />
              : <ChatList onOpenRoom={(r) => setActiveRoom(r)} />}
        </View>
        <View style={styles.tabBar}>
          <TouchableOpacity style={styles.tab} onPress={() => setTab("feed")} activeOpacity={0.7}>
            <Text style={[styles.tabIcon, tab === "feed" && styles.tabActiveSaffron]}>▦</Text>
            <Text style={[styles.tabLabel, tab === "feed" && styles.tabActiveSaffron]}>Posts</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => setTab("books")} activeOpacity={0.7}>
            <Text style={[styles.tabIcon, tab === "books" && styles.tabActiveSaffron]}>📖</Text>
            <Text style={[styles.tabLabel, tab === "books" && styles.tabActiveSaffron]}>Books</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tab} onPress={() => setTab("chat")} activeOpacity={0.7}>
            <Text style={[styles.tabIcon, tab === "chat" && styles.tabActiveGreen]}>💬</Text>
            <Text style={[styles.tabLabel, tab === "chat" && styles.tabActiveGreen]}>Chat</Text>
          </TouchableOpacity>
        </View>
        <SafeAreaView edges={["bottom"]} style={styles.tabSafe} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  tabBar: { flexDirection: "row", height: 58, borderTopWidth: 1, borderTopColor: "#e5e7eb", backgroundColor: "#fff" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { fontSize: 20, color: "#9ca3af" },
  tabLabel: { fontSize: 11, fontWeight: "600", color: "#9ca3af" },
  tabActiveSaffron: { color: COLORS.saffron },
  tabActiveGreen: { color: COLORS.waGreen },
  tabSafe: { backgroundColor: "#fff" },
});
