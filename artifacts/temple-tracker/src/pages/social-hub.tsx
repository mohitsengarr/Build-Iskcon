import { motion, AnimatePresence } from "framer-motion";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { useState, useEffect } from "react";
import { fadeInUp, fadeIn, staggerContainerFast, viewportOnce } from "@/lib/animations";
import { Link } from "wouter";
import { Heart, MessageCircle, Repeat2, Share, MoreHorizontal, TrendingUp, RefreshCw, Zap, Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface FeedPost {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  likes: number;
  hashtags: string | null;
  createdAt: string;
  templeId: number;
  templeName: string;
  templeLocation: string;
  templeStatus: string;
}

interface Temple {
  id: number;
  name: string;
  location: string;
  status: string;
}

interface SyncStatus {
  lastSync: {
    jobId: number;
    status: string;
    templesUpdated: number;
    templesAdded: number;
    socialPostsCreated: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
  nextSyncHint: string;
  cronSchedule: string;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const TRENDING = [
  { tag: "LOGISTICS · TRENDING", title: "Mayapur Chakra Installation", posts: "12.4k posts" },
  { tag: "FUNDRAISING · TRENDING", title: "Gita Bhavan Restoration", posts: "8.1k posts" },
  { tag: "EVENTS · TRENDING", title: "Global Vedic Expo 2026", posts: "5.2k posts" },
];

const CATEGORY_COLORS: Record<string, string> = {
  construction: "bg-primary/80 text-on-primary",
  spiritual: "bg-secondary/80 text-on-secondary",
  fundraising: "bg-secondary-container/90 text-on-secondary-container",
  logistics: "bg-tertiary/80 text-on-tertiary",
  general: "bg-surface-container/90 text-on-surface-variant",
};

// Derive a short display name from a temple's full name
function shortName(name: string): string {
  const words = name.split(" ");
  // Skip common prefixes
  const skip = new Set(["Sri", "Shri", "ISKCON", "The"]);
  const meaningful = words.filter(w => !skip.has(w));
  return meaningful.length > 0 ? meaningful[0]! : words[0]!;
}

// Get initials for avatar (first letter of each meaningful word)
function getInitials(name: string): string {
  const words = name.split(" ").filter(w => w.length > 0);
  if (words.length === 1) return words[0]!.substring(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

// Format author as a short handle — max 3 words to stay readable on mobile
function toHandle(author: string): string {
  const words = author.trim().split(/\s+/).slice(0, 3);
  return words.join("_").replace(/[^A-Za-z0-9_]/g, "");
}

const RING_GRADIENTS = [
  "from-primary to-secondary-container",
  "from-secondary to-primary-container",
  "from-primary to-primary-container",
  "from-tertiary to-secondary-container",
  "from-primary-container to-secondary",
];

function StoryRing({ temple, idx }: { temple: Temple; idx: number }) {
  const initials = getInitials(temple.name);
  const grad = RING_GRADIENTS[idx % RING_GRADIENTS.length];
  const label = shortName(temple.name);
  return (
    <Link href={`/temples/${temple.id}`}>
      <div className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group">
        <div className={`w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr ${grad} group-hover:scale-105 transition-transform`}>
          <div className="w-full h-full rounded-full border-2 border-surface bg-surface-container-high flex items-center justify-center">
            <span className="text-primary font-serif font-bold text-base">{initials}</span>
          </div>
        </div>
        <span className="text-xs font-semibold text-on-surface-variant truncate w-16 text-center">
          {label}
        </span>
      </div>
    </Link>
  );
}

function AvatarBadge({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = getInitials(name);
  const dim = size === "md" ? "w-12 h-12 text-sm" : "w-9 h-9 text-xs";
  return (
    <div className={`${dim} rounded-full bg-gradient-to-tr from-primary to-secondary-container flex items-center justify-center flex-shrink-0`}>
      <span className="text-on-primary font-bold font-serif">{initials}</span>
    </div>
  );
}

function PostCard({ post, isLast = false, index = 0 }: { post: FeedPost; isLast?: boolean; index?: number }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);

  const handleLike = async () => {
    if (liked) return;
    setLiked(true);
    setLikeCount(c => c + 1);
    try {
      await fetch(`${API}/social/posts/${post.id}/like`, { method: "POST" });
    } catch {}
  };

  const handle = toHandle(post.author);
  const timeAgo = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });

  return (
    <motion.article
      className="flex gap-3 px-5 py-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Left: avatar + thread line */}
      <div className="flex flex-col items-center flex-shrink-0">
        <Link href={`/temples/${post.templeId}`}>
          <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary-container p-[2px] flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity">
            <div className="w-full h-full rounded-full bg-surface-container-high flex items-center justify-center">
              <span className="text-primary font-bold text-xs font-serif">
                {getInitials(post.templeName)}
              </span>
            </div>
          </div>
        </Link>
        {!isLast && (
          <div className="w-px flex-1 mt-2 bg-on-surface/10 min-h-[24px]" />
        )}
      </div>

      {/* Right: content */}
      <div className="flex-1 min-w-0 pb-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <Link href={`/temples/${post.templeId}`}>
              <span className="text-sm font-bold text-on-surface hover:text-primary transition-colors cursor-pointer truncate">
                {handle}
              </span>
            </Link>
            <span className={cn(
              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0",
              CATEGORY_COLORS[post.category] ?? CATEGORY_COLORS.general
            )}>
              {post.category}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <span className="text-xs text-on-surface-variant">{timeAgo}</span>
            <button className="text-on-surface-variant hover:text-on-surface transition-colors p-0.5 rounded-full hover:bg-surface-container">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Text content */}
        <p className="text-sm text-on-surface leading-relaxed mb-2">
          {post.content}
        </p>

        {/* Hashtags */}
        {post.hashtags && (
          <p className="text-sm text-primary font-medium mb-3">{post.hashtags}</p>
        )}

        {/* Source article link */}
        {post.sourceUrl && (
          <a
            href={post.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 mb-3 px-4 py-3 rounded-xl bg-surface-container hover:bg-surface-container-high transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant mb-0.5">
                Source Article
              </p>
              <p className="text-xs font-semibold text-on-surface group-hover:text-primary transition-colors truncate">
                {(() => {
                  try { return new URL(post.sourceUrl!).hostname.replace(/^www\./, ""); }
                  catch { return post.sourceUrl; }
                })()}
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-primary transition-colors flex-shrink-0" />
          </a>
        )}

        {/* Action row */}
        <div className="flex items-center gap-4 mt-1">
          <button
            onClick={handleLike}
            className={cn(
              "flex items-center gap-1.5 text-xs transition-all duration-150 hover:scale-105 active:scale-95",
              liked ? "text-error" : "text-on-surface-variant hover:text-error"
            )}
          >
            <Heart className={cn("w-4 h-4", liked && "fill-current")} />
            <span>{likeCount.toLocaleString()}</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors hover:scale-105 duration-150">
            <MessageCircle className="w-4 h-4" />
            <span>Reply</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors hover:scale-105 duration-150">
            <Repeat2 className="w-4 h-4" />
            <span>Repost</span>
          </button>
          <button className="flex items-center gap-1.5 text-xs text-on-surface-variant hover:text-primary transition-colors hover:scale-105 duration-150">
            <Share className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function SyncBanner({ sync }: { sync: SyncStatus | null }) {
  if (!sync?.lastSync) return null;
  const { lastSync } = sync;
  const isRunning = lastSync.status === "running";
  const timeAgo = lastSync.completedAt
    ? formatDistanceToNow(new Date(lastSync.completedAt), { addSuffix: true })
    : formatDistanceToNow(new Date(lastSync.startedAt), { addSuffix: true });

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm",
      isRunning
        ? "bg-primary/10 text-primary"
        : lastSync.status === "failed"
          ? "bg-error/10 text-error"
          : "bg-surface-container-low text-on-surface-variant"
    )}>
      <div className="flex items-center gap-2 min-w-0">
        {isRunning ? (
          <RefreshCw className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
        ) : (
          <Zap className="w-4 h-4 text-primary flex-shrink-0" />
        )}
        <span className="font-semibold text-on-surface whitespace-nowrap">
          {isRunning ? "AI sync in progress…" : "AI sync complete"}
        </span>
        {!isRunning && (
          <span className="hidden sm:inline text-on-surface-variant truncate">
            · {lastSync.socialPostsCreated} posts · {lastSync.templesUpdated} temples updated
            {lastSync.templesAdded > 0 && ` · ${lastSync.templesAdded} discovered`}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 text-on-surface-variant text-xs whitespace-nowrap flex-shrink-0">
        <Clock className="w-3 h-3" />
        <span>{isRunning ? "Now" : timeAgo}</span>
        <span className="hidden md:inline opacity-50 ml-1">· {sync.nextSyncHint}</span>
      </div>
    </div>
  );
}

export default function SocialHub() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [temples, setTemples] = useState<Temple[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadFeed = () => {
    setLoading(true);
    fetch(`${API}/social/feed?limit=20`)
      .then(r => r.json())
      .then(data => {
        setPosts(data.posts ?? []);
        setTemples(data.temples ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const loadSyncStatus = () => {
    fetch(`${API}/social/sync-status`)
      .then(r => r.json())
      .then(data => setSyncStatus(data))
      .catch(() => {});
  };

  useEffect(() => {
    loadFeed();
    loadSyncStatus();
    // Refresh sync status every 30s to catch live cron updates
    const interval = setInterval(loadSyncStatus, 30_000);
    return () => clearInterval(interval);
  }, []);

  const suggestedTemples = temples.slice(0, 3);

  return (
    <Layout>
      <SEOHead
        title="Social Hub — Community Updates"
        description="Follow real-time construction updates, fundraising announcements, and devotee community posts from ISKCON temple projects around the world."
        canonicalPath="/social"
        structuredData={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "Build Iskcon Social Hub",
          description: "Community social feed for ISKCON temple construction updates and devotee announcements",
          url: typeof window !== "undefined" ? `${window.location.origin}/social` : "",
        }}
      />
      <div className="px-4 md:px-8 max-w-screen-xl mx-auto pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ── CENTER FEED ── */}
          <div className="lg:col-span-8 space-y-6">

            {/* AI Sync Status Banner */}
            <SyncBanner sync={syncStatus} />

            {/* Stories Bar */}
            <div className="bg-surface-container-low rounded-xl p-5 overflow-hidden">
              {loading ? (
                <div className="flex gap-6 overflow-x-auto pb-1">
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
                      <div className="w-16 h-16 rounded-full bg-surface-container-high animate-pulse" />
                      <div className="w-10 h-2 bg-surface-container-high rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-5 overflow-x-auto pb-1 hide-scrollbar">
                  {temples.map((t, i) => <StoryRing key={t.id} temple={t} idx={i} />)}
                </div>
              )}
            </div>

            {/* Feed Posts */}
            {loading ? (
              <div className="bg-surface-container-lowest rounded-xl shadow-[0_2px_16px_rgba(27,28,28,0.06)] divide-y divide-on-surface/5">
                {[1,2,3,4].map(i => (
                  <div key={i} className="flex gap-3 px-5 py-4">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className="w-10 h-10 rounded-full bg-surface-container-high animate-pulse" />
                      {i < 4 && <div className="w-px flex-1 mt-2 bg-on-surface/10 min-h-[24px]" />}
                    </div>
                    <div className="flex-1 space-y-2 pb-4">
                      <div className="flex justify-between">
                        <div className="w-28 h-3 bg-surface-container-high rounded animate-pulse" />
                        <div className="w-16 h-2.5 bg-surface-container-high rounded animate-pulse" />
                      </div>
                      <div className="w-full h-3 bg-surface-container-high rounded animate-pulse" />
                      <div className="w-5/6 h-3 bg-surface-container-high rounded animate-pulse" />
                      <div className="w-3/4 h-3 bg-surface-container-high rounded animate-pulse" />
                      <div className="flex gap-4 pt-1">
                        {[1,2,3].map(j => <div key={j} className="w-10 h-2.5 bg-surface-container-high rounded animate-pulse" />)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="bg-surface-container-low rounded-xl p-16 text-center">
                <div className="text-6xl mb-6">🛕</div>
                <h3 className="font-serif text-2xl font-bold text-on-surface mb-3">No posts yet</h3>
                <p className="text-on-surface-variant text-sm mb-8 max-w-xs mx-auto leading-relaxed">
                  The social feed is populated by the AI sync. Trigger a manual sync to generate posts.
                </p>
                <button
                  onClick={loadFeed}
                  className="flex items-center gap-2 mx-auto bg-primary text-on-primary px-6 py-3 rounded-xl font-bold text-sm"
                >
                  <RefreshCw className="w-4 h-4" /> Refresh Feed
                </button>
              </div>
            ) : (
              <div className="bg-surface-container-lowest rounded-xl shadow-[0_2px_16px_rgba(27,28,28,0.06)] divide-y divide-on-surface/5">
                {posts.map((post, idx) => (
                  <PostCard key={post.id} post={post} isLast={idx === posts.length - 1} index={idx} />
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-28 space-y-5">

              {/* Profile card */}
              <div className="bg-surface-container-low rounded-xl p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AvatarBadge name="Hare Krishna" size="md" />
                  <div>
                    <p className="font-bold text-on-surface text-sm">Hare_Krishna</p>
                    <p className="text-xs text-on-surface-variant">Global Projects Office</p>
                  </div>
                </div>
                <button className="text-xs font-bold text-primary hover:text-secondary transition-colors uppercase tracking-widest">
                  Switch
                </button>
              </div>

              {/* Suggested temples */}
              <div className="bg-surface-container-low rounded-xl p-5">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Suggested For You</h3>
                  <Link href="/temples">
                    <button className="text-xs font-bold text-primary uppercase tracking-widest hover:text-secondary transition-colors">
                      See All
                    </button>
                  </Link>
                </div>
                <div className="space-y-4">
                  {loading ? (
                    [1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-3 animate-pulse">
                        <div className="w-9 h-9 rounded-full bg-surface-container-high" />
                        <div className="flex-1 space-y-1.5">
                          <div className="w-28 h-2.5 bg-surface-container-high rounded" />
                          <div className="w-20 h-2 bg-surface-container-high rounded" />
                        </div>
                      </div>
                    ))
                  ) : (
                    suggestedTemples.map((t, i) => (
                      <Link href={`/temples/${t.id}`} key={t.id}>
                        <div className="flex items-center justify-between group cursor-pointer">
                          <div className="flex items-center gap-3">
                            <AvatarBadge name={t.name} />
                            <div>
                              <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors leading-none mb-0.5">
                                {toHandle(shortName(t.name))}
                              </p>
                              <p className="text-[10px] text-on-surface-variant">
                                {i === 0 ? "Suggested for you" : `Followed by ${t.location.split(",")[0]?.trim()}`}
                              </p>
                            </div>
                          </div>
                          <button className="text-xs font-bold text-primary hover:text-secondary transition-colors uppercase tracking-widest">
                            Follow
                          </button>
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              {/* Trending updates */}
              <div className="bg-surface-container-low rounded-xl p-5">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Trending Updates</h3>
                </div>
                <div className="space-y-5">
                  {TRENDING.map((t, i) => (
                    <div key={i} className="cursor-pointer group">
                      <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold mb-0.5">{t.tag}</p>
                      <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors font-serif">{t.title}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{t.posts}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="px-1 space-y-1.5">
                <p className="text-[10px] text-on-surface-variant/50 leading-loose">
                  About · Help · Press · API · Privacy · Terms · Locations
                </p>
                <p className="text-[10px] text-on-surface-variant/40">
                  © 2026 Hare Krishna
                </p>
              </div>

            </div>
          </aside>

        </div>
      </div>
    </Layout>
  );
}
