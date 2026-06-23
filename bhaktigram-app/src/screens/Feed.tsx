import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, Image, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, StyleSheet, Dimensions,
} from "react-native";
import { rest } from "../supabase";
import { getDeviceId, FeedPost, COLORS } from "../lib";

const { width: SCREEN_W } = Dimensions.get("window");

interface PostState extends FeedPost {
  likeCount: number;
  liked: boolean;
  expanded: boolean;
}

export default function Feed() {
  const [posts, setPosts] = useState<PostState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deviceId, setDeviceId] = useState("");

  useEffect(() => { getDeviceId().then(setDeviceId); }, []);

  const load = useCallback(async () => {
    try {
      const r = await rest(
        "ig_pending_review?status=eq.approved&select=id,image_url,caption,chapter_canto,chapter_in_canto,created_at,reviewed_at&order=reviewed_at.desc.nullslast&limit=60",
      );
      if (!r.ok) { setLoading(false); return; }
      const rows = (await r.json()) as FeedPost[];
      const ids = rows.map(p => p.id);
      const counts: Record<number, number> = {};
      const mine = new Set<number>();
      if (ids.length) {
        const dev = await getDeviceId();
        const lr = await rest(`bhaktigram_likes?ig_post_id=in.(${ids.join(",")})&select=ig_post_id,device_id`);
        if (lr.ok) {
          const likes = (await lr.json()) as Array<{ ig_post_id: number; device_id: string }>;
          for (const l of likes) {
            counts[l.ig_post_id] = (counts[l.ig_post_id] || 0) + 1;
            if (l.device_id === dev) mine.add(l.ig_post_id);
          }
        }
      }
      setPosts(rows.map(p => ({
        ...p,
        likeCount: counts[p.id] || 0,
        liked: mine.has(p.id),
        expanded: false,
      })));
    } catch { /* offline */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleLike = useCallback(async (post: PostState) => {
    if (!deviceId) return;
    const liked = !post.liked;
    setPosts(prev => prev.map(p => p.id === post.id
      ? { ...p, liked, likeCount: Math.max(0, p.likeCount + (liked ? 1 : -1)) }
      : p));
    try {
      if (liked) {
        await rest("bhaktigram_likes", {
          method: "POST",
          headers: { Prefer: "resolution=ignore-duplicates" },
          body: JSON.stringify({ ig_post_id: post.id, device_id: deviceId }),
        });
      } else {
        await rest(`bhaktigram_likes?ig_post_id=eq.${post.id}&device_id=eq.${encodeURIComponent(deviceId)}`, {
          method: "DELETE",
        });
      }
    } catch {
      // revert on failure
      setPosts(prev => prev.map(p => p.id === post.id
        ? { ...p, liked: post.liked, likeCount: post.likeCount }
        : p));
    }
  }, [deviceId]);

  const renderItem = useCallback(({ item }: { item: PostState }) => {
    const caption = item.caption || "";
    const short = caption.length > 120 && !item.expanded ? caption.slice(0, 120).trim() + "…" : caption;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>BI</Text></View>
          <Text style={styles.handle}>bhaktigram</Text>
          {item.chapter_canto != null && (
            <Text style={styles.kicker}>  ·  Canto {item.chapter_canto}.{item.chapter_in_canto}</Text>
          )}
        </View>
        <Image
          source={{ uri: item.image_url }}
          style={styles.image}
          resizeMode="cover"
        />
        <View style={styles.actions}>
          <TouchableOpacity onPress={() => toggleLike(item)} activeOpacity={0.7} style={styles.likeBtn}>
            <Text style={[styles.heart, item.liked && styles.heartOn]}>{item.liked ? "♥" : "♡"}</Text>
          </TouchableOpacity>
          {item.likeCount > 0 && (
            <Text style={styles.likeCount}>{item.likeCount} {item.likeCount === 1 ? "like" : "likes"}</Text>
          )}
        </View>
        {!!caption && (
          <TouchableOpacity activeOpacity={0.9} onPress={() => setPosts(prev => prev.map(p => p.id === item.id ? { ...p, expanded: !p.expanded } : p))}>
            <Text style={styles.caption}>
              <Text style={styles.captionHandle}>bhaktigram </Text>
              {short}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }, [toggleLike]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.saffron} size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}><Text style={styles.brand}>Bhaktigram</Text></View>
      <FlatList
        data={posts}
        keyExtractor={p => String(p.id)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.saffron} />}
        ListEmptyComponent={<View style={styles.center}><Text style={styles.empty}>No posts yet. Pull to refresh.</Text></View>}
        contentContainerStyle={posts.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  empty: { color: COLORS.muted, fontSize: 15 },
  topBar: { height: 52, alignItems: "center", justifyContent: "center", borderBottomWidth: 1, borderBottomColor: "#eee", backgroundColor: "#fff" },
  brand: { fontSize: 22, fontWeight: "800", color: COLORS.saffron, letterSpacing: 0.3 },
  card: { backgroundColor: "#fff", marginBottom: 8 },
  cardHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#ffedd5", alignItems: "center", justifyContent: "center", marginRight: 8 },
  avatarTxt: { color: COLORS.saffron, fontWeight: "800", fontSize: 11 },
  handle: { fontWeight: "700", color: COLORS.ink, fontSize: 14 },
  kicker: { color: COLORS.muted, fontSize: 12 },
  image: { width: SCREEN_W, height: SCREEN_W * 1.2, backgroundColor: "#f1efe8" },
  actions: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 8, gap: 10 },
  likeBtn: { paddingRight: 4 },
  heart: { fontSize: 26, color: COLORS.ink },
  heartOn: { color: "#e0245e" },
  likeCount: { fontWeight: "700", color: COLORS.ink, fontSize: 13 },
  caption: { paddingHorizontal: 12, paddingTop: 6, color: COLORS.ink, fontSize: 14, lineHeight: 20 },
  captionHandle: { fontWeight: "700" },
});
