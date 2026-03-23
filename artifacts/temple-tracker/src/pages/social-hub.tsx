import { Layout } from "@/components/layout/Layout";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, TrendingUp } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface FeedPost {
  id: number;
  title: string;
  content: string;
  author: string;
  category: string;
  imageUrl: string | null;
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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

const TRENDING = [
  { tag: "LOGISTICS · TRENDING", title: "Mayapur Chakra Installation", posts: "12.4k posts" },
  { tag: "FUNDRAISING · TRENDING", title: "Gita Bhavan Restoration", posts: "8.1k posts" },
  { tag: "EVENTS · TRENDING", title: "Global Vedic Expo 2026", posts: "5.2k posts" },
];

function StoryRing({ temple }: { temple: Temple }) {
  const initials = temple.name.substring(0, 2).toUpperCase();
  const colors = ["from-primary to-secondary-container", "from-secondary to-primary-container", "from-tertiary to-secondary-container"];
  const grad = colors[temple.id % colors.length];
  return (
    <div className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group">
      <div className={`w-16 h-16 rounded-full p-[2px] bg-gradient-to-tr ${grad}`}>
        <div className="w-full h-full rounded-full border-2 border-surface bg-surface-container-high flex items-center justify-center overflow-hidden">
          <span className="text-primary font-serif font-bold text-lg">{initials}</span>
        </div>
      </div>
      <span className="text-xs font-semibold text-on-surface-variant truncate w-16 text-center">
        {temple.name.split(" ")[0]}
      </span>
    </div>
  );
}

function PostCard({ post }: { post: FeedPost }) {
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [bookmarked, setBookmarked] = useState(false);

  const handleLike = async () => {
    if (liked) return;
    setLiked(true);
    setLikeCount(c => c + 1);
    try {
      await fetch(`${API}/social/posts/${post.id}/like`, { method: "POST" });
    } catch {}
  };

  const locationSlug = post.templeLocation.split(",")[0]?.trim().replace(/\s+/g, "_").toUpperCase();

  return (
    <article className="bg-surface-container-lowest rounded-xl shadow-[0_4px_24px_rgba(27,28,28,0.06)] overflow-hidden">
      {/* Post Header */}
      <div className="p-4 flex items-center justify-between">
        <Link href={`/temples/${post.templeId}`}>
          <div className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-secondary-container p-[2px] flex-shrink-0">
              <div className="w-full h-full rounded-full bg-surface-container-high flex items-center justify-center">
                <span className="text-primary font-bold text-xs font-serif">
                  {post.templeName.substring(0, 2).toUpperCase()}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                {post.author.replace(/\s+/g, "_")}
              </p>
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">
                {locationSlug}
              </p>
            </div>
          </div>
        </Link>
        <button className="text-on-surface-variant hover:text-on-surface transition-colors p-1">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Post Image */}
      {post.imageUrl && (
        <div className="aspect-video w-full bg-surface-container relative overflow-hidden">
          <img
            src={post.imageUrl}
            alt={post.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          <div className="absolute top-3 left-3">
            <span className={cn(
              "text-[10px] font-bold uppercase px-2.5 py-1 rounded-full backdrop-blur-sm",
              post.category === "construction" ? "bg-primary/80 text-on-primary" :
              post.category === "spiritual" ? "bg-secondary/80 text-on-secondary" :
              post.category === "fundraising" ? "bg-secondary-container/90 text-on-secondary-container" :
              "bg-surface-container/90 text-on-surface-variant"
            )}>
              {post.category}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-4">
            <button
              onClick={handleLike}
              className={cn("transition-all hover:scale-110 active:scale-95", liked ? "text-error" : "text-on-surface-variant hover:text-error")}
            >
              <Heart className={cn("w-6 h-6", liked && "fill-current")} />
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors hover:scale-110">
              <MessageCircle className="w-6 h-6" />
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors hover:scale-110">
              <Send className="w-6 h-6" />
            </button>
          </div>
          <button
            onClick={() => setBookmarked(b => !b)}
            className={cn("transition-all hover:scale-110", bookmarked ? "text-primary" : "text-on-surface-variant")}
          >
            <Bookmark className={cn("w-6 h-6", bookmarked && "fill-current")} />
          </button>
        </div>

        {/* Likes */}
        <p className="text-sm font-bold text-on-surface">
          {likeCount.toLocaleString()} likes
        </p>

        {/* Caption */}
        <p className="text-sm text-on-surface leading-relaxed">
          <span className="font-bold">{post.author.replace(/\s+/g, "_")} </span>
          {post.content}
        </p>

        {/* Hashtags */}
        {post.hashtags && (
          <p className="text-sm text-primary font-medium">{post.hashtags}</p>
        )}

        {/* Comments link */}
        <button className="text-xs text-on-surface-variant font-medium uppercase tracking-tight hover:text-primary transition-colors">
          View all comments
        </button>

        {/* Timestamp */}
        <p className="text-[10px] text-outline uppercase tracking-tighter">
          {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true }).toUpperCase()}
        </p>
      </div>
    </article>
  );
}

export default function SocialHub() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [temples, setTemples] = useState<Temple[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/social/feed?limit=20`)
      .then(r => r.json())
      .then(data => {
        setPosts(data.posts ?? []);
        setTemples(data.temples ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="px-4 md:px-8 max-w-screen-xl mx-auto pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ── LEFT: Feed Column ── */}
          <div className="lg:col-span-8 space-y-8">

            {/* Stories */}
            <div className="bg-surface-container-low rounded-xl p-4 overflow-hidden">
              {temples.length === 0 ? (
                <div className="flex gap-6 overflow-x-auto pb-2">
                  {[1,2,3,4,5].map(i => (
                    <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
                      <div className="w-16 h-16 rounded-full bg-surface-container-high animate-pulse" />
                      <div className="w-12 h-2 bg-surface-container-high rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex gap-6 overflow-x-auto pb-2 hide-scrollbar">
                  {temples.map(t => <StoryRing key={t.id} temple={t} />)}
                </div>
              )}
            </div>

            {/* Feed */}
            {loading ? (
              <div className="space-y-8">
                {[1,2,3].map(i => (
                  <div key={i} className="bg-surface-container-lowest rounded-xl overflow-hidden shadow-[0_4px_24px_rgba(27,28,28,0.06)]">
                    <div className="p-4 flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-surface-container animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="w-32 h-3 bg-surface-container rounded animate-pulse" />
                        <div className="w-20 h-2 bg-surface-container rounded animate-pulse" />
                      </div>
                    </div>
                    <div className="aspect-video bg-surface-container animate-pulse" />
                    <div className="p-4 space-y-3">
                      <div className="flex gap-4">
                        {[1,2,3].map(j => <div key={j} className="w-6 h-6 bg-surface-container rounded animate-pulse" />)}
                      </div>
                      <div className="w-24 h-3 bg-surface-container rounded animate-pulse" />
                      <div className="w-full h-4 bg-surface-container rounded animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : posts.length === 0 ? (
              <div className="bg-surface-container-low rounded-xl p-16 text-center">
                <div className="text-5xl mb-4">🕌</div>
                <h3 className="font-serif text-2xl font-bold text-on-surface mb-2">No posts yet</h3>
                <p className="text-on-surface-variant text-sm mb-6">
                  The social feed is populated by the hourly AI sync. Trigger a manual sync to generate posts with images.
                </p>
                <p className="text-xs text-on-surface-variant uppercase tracking-widest font-bold">
                  Use the "Sync Data" button in the top navigation
                </p>
              </div>
            ) : (
              posts.map(post => <PostCard key={post.id} post={post} />)
            )}
          </div>

          {/* ── RIGHT: Sidebar ── */}
          <aside className="hidden lg:block lg:col-span-4 space-y-6 sticky top-28 self-start">

            {/* Profile Card */}
            <div className="bg-surface-container-low rounded-xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-secondary-container flex items-center justify-center">
                  <span className="text-on-primary font-serif font-bold">II</span>
                </div>
                <div>
                  <p className="font-bold text-on-surface text-sm">ISKCON_Intel</p>
                  <p className="text-xs text-on-surface-variant">Global Projects Office</p>
                </div>
              </div>
              <button className="text-xs font-bold text-primary hover:text-secondary transition-colors uppercase tracking-widest">
                Switch
              </button>
            </div>

            {/* Suggested Temples */}
            <div className="bg-surface-container-low rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Suggested For You</h3>
                <button className="text-xs font-bold text-primary uppercase tracking-widest hover:text-secondary transition-colors">
                  See All
                </button>
              </div>
              <div className="space-y-4">
                {(temples.length > 0 ? temples.slice(0, 3) : [1,2,3]).map((t, i) => (
                  typeof t === 'object' ? (
                    <Link href={`/temples/${t.id}`} key={t.id}>
                      <div className="flex items-center justify-between group cursor-pointer">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-primary to-secondary-container flex items-center justify-center flex-shrink-0">
                            <span className="text-on-primary font-bold text-xs font-serif">
                              {t.name.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                              {t.name.split(" ").slice(0, 2).join("_")}
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
                  ) : (
                    <div key={i} className="flex items-center gap-3 animate-pulse">
                      <div className="w-9 h-9 rounded-full bg-surface-container" />
                      <div className="flex-1 space-y-1">
                        <div className="w-28 h-2.5 bg-surface-container rounded" />
                        <div className="w-20 h-2 bg-surface-container rounded" />
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            {/* Trending Updates */}
            <div className="bg-surface-container-low rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Trending Updates</h3>
              </div>
              <div className="space-y-4">
                {TRENDING.map((t, i) => (
                  <div key={i} className="cursor-pointer group">
                    <p className="text-[10px] text-on-surface-variant uppercase tracking-widest font-semibold">{t.tag}</p>
                    <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors mt-0.5">{t.title}</p>
                    <p className="text-xs text-on-surface-variant">{t.posts}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer links */}
            <div className="px-1">
              <p className="text-[10px] text-on-surface-variant/50 uppercase tracking-widest leading-loose">
                About · Help · Press · API · Privacy · Terms · Locations
              </p>
              <p className="text-[10px] text-on-surface-variant/40 uppercase tracking-widest mt-2">
                © 2026 ISKCON Intelligence
              </p>
            </div>
          </aside>

        </div>
      </div>
    </Layout>
  );
}
