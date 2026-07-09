import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute, Link } from "wouter";
import {
  ArrowLeft, MapPin, Users, Image as ImageIcon, ListChecks, MessageCircle,
  Video, Bell, Send, Loader2, Sparkles, Heart, Camera, Megaphone, Flag,
} from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import ThreeTemple from "@/components/ThreeTemple";
import {
  getTempleBySlug, listPosts, createPost, listMembers, joinTemple, isMember,
  listMessages, sendMessage, subscribeEmail, subscribeTempleRealtime, uploadTempleMedia,
  templeCallUrl, getAuthorName, setAuthorName, TEMPLE_STYLES,
  type CommunityTemple, type TemplePost, type TempleMember, type TempleMessage, type PostKind,
} from "@/lib/communityTemples";

const KIND_META: Record<PostKind, { label: string; icon: typeof Megaphone; color: string }> = {
  update: { label: "Update", icon: Megaphone, color: "text-primary" },
  requirement: { label: "Requirement", icon: Flag, color: "text-amber-600" },
  photo: { label: "Photo", icon: Camera, color: "text-emerald-600" },
  milestone: { label: "Milestone", icon: Sparkles, color: "text-purple-600" },
};

function initials(name: string | null | undefined): string {
  const n = (name || "Devotee").trim();
  return n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "D";
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function TempleCommunity() {
  const [, params] = useRoute("/temple/:slug");
  const slug = params?.slug || "";
  const { toast } = useToast();

  const [temple, setTemple] = useState<CommunityTemple | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<TemplePost[]>([]);
  const [members, setMembers] = useState<TempleMember[]>([]);
  const [messages, setMessages] = useState<TempleMessage[]>([]);
  const [joined, setJoined] = useState(false);

  // composer
  const [postBody, setPostBody] = useState("");
  const [postKind, setPostKind] = useState<PostKind>("update");
  const [posting, setPosting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // chat + subscribe
  const [chatInput, setChatInput] = useState("");
  const [email, setEmail] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const t = await getTempleBySlug(slug).catch(() => null);
      if (!alive) return;
      setTemple(t);
      setLoading(false);
      if (!t) return;
      listPosts(t.id).then((p) => alive && setPosts(p)).catch(() => {});
      listMembers(t.id).then((m) => alive && setMembers(m)).catch(() => {});
      listMessages(t.id).then((m) => alive && setMessages(m)).catch(() => {});
      isMember(t.id).then((j) => alive && setJoined(j)).catch(() => {});
      const unsub = subscribeTempleRealtime(t.id, {
        onPost: (p) => setPosts((prev) => (prev.some((x) => x.id === p.id) ? prev : [p, ...prev])),
        onMessage: (m) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
      });
      return () => unsub();
    })();
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const styleLabel = useMemo(
    () => TEMPLE_STYLES.find((s) => s.key === temple?.style)?.label ?? "Vedic",
    [temple?.style],
  );
  const photos = useMemo(() => posts.flatMap((p) => p.media_urls || []), [posts]);
  const requirements = useMemo(() => posts.filter((p) => p.kind === "requirement"), [posts]);

  async function ensureName(): Promise<boolean> {
    if (getAuthorName() !== "Devotee") return true;
    const n = window.prompt("Your name (how devotees will see you):")?.trim();
    if (!n) return false;
    setAuthorName(n);
    return true;
  }

  async function handleJoin() {
    if (!temple) return;
    if (!(await ensureName())) return;
    try {
      await joinTemple(temple.id);
      setJoined(true);
      setMembers(await listMembers(temple.id));
      toast({ title: "🙏 You're in", description: "You're now supporting this temple." });
    } catch {
      toast({ title: "Couldn't join", variant: "destructive" });
    }
  }

  async function handlePost() {
    if (!temple || (!postBody.trim() && !fileRef.current?.files?.length)) return;
    if (!(await ensureName())) return;
    setPosting(true);
    try {
      let media_urls: string[] = [];
      const f = fileRef.current?.files?.[0];
      if (f) {
        const url = await uploadTempleMedia(f);
        media_urls = [url];
      }
      await createPost(temple.id, {
        body: postBody.trim() || undefined,
        kind: f && !postBody.trim() ? "photo" : postKind,
        media_urls,
      });
      setPostBody("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast({ title: "Post failed", description: e instanceof Error ? e.message : "", variant: "destructive" });
    } finally {
      setPosting(false);
    }
  }

  async function handleSend() {
    if (!temple || !chatInput.trim()) return;
    if (!(await ensureName())) return;
    const body = chatInput.trim();
    setChatInput("");
    try {
      await sendMessage(temple.id, body);
    } catch {
      toast({ title: "Message not sent", variant: "destructive" });
    }
  }

  async function handleSubscribe() {
    if (!temple || !email.trim()) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      toast({ title: "Enter a valid email" });
      return;
    }
    try {
      await subscribeEmail(temple.id, email.trim());
      setEmail("");
      toast({ title: "🔔 Subscribed", description: "You'll get email updates on this temple." });
    } catch {
      toast({ title: "Couldn't subscribe", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-32 text-on-surface-variant">
          <Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading temple…
        </div>
      </Layout>
    );
  }

  if (!temple) {
    return (
      <Layout>
        <SEOHead title="Temple not found" />
        <div className="mx-auto max-w-xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">Temple not found</h1>
          <p className="mt-2 text-on-surface-variant">This community page doesn't exist yet.</p>
          <Link href="/design-temple" className="mt-6 inline-block">
            <Button size="lg" className="rounded-xl"><Sparkles className="h-4 w-4 mr-2" /> Design a temple</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const fundPct = temple.fundraising_goal > 0
    ? Math.min(100, Math.round((temple.fundraising_raised / temple.fundraising_goal) * 100))
    : 0;

  return (
    <Layout>
      <SEOHead
        title={`${temple.name} — Community`}
        description={temple.description || `Join the community building ${temple.name} in ${temple.city}, ${temple.state}.`}
      />

      {/* ── Cover ── */}
      <div className="relative bg-gradient-to-br from-primary/10 via-surface to-surface border-b border-border">
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <Link href="/design-temple" className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Design another temple
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-4 py-6 grid gap-6 md:grid-cols-[300px_1fr] items-center">
          <div className="h-[220px] rounded-2xl overflow-hidden border border-border bg-[#fbf6ee]">
            <ThreeTemple style={temple.style ?? "tovp-dome"} autoRotate interactive={false} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary capitalize">{temple.status}</span>
              <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-medium">{styleLabel}</span>
            </div>
            <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{temple.name}</h1>
            <div className="mt-1 flex items-center gap-1.5 text-on-surface-variant">
              <MapPin className="h-4 w-4" />
              <span>{temple.city}{temple.state ? `, ${temple.state}` : ""}</span>
              {temple.deity && <span className="mx-1">·</span>}
              {temple.deity && <span>{temple.deity}</span>}
            </div>
            {temple.description && <p className="mt-3 max-w-2xl text-sm text-on-surface-variant">{temple.description}</p>}

            <div className="mt-4 max-w-md">
              <div className="flex justify-between text-xs text-on-surface-variant mb-1">
                <span>Construction</span><span>{temple.construction_progress}%</span>
              </div>
              <Progress value={temple.construction_progress} className="h-2" />
              {temple.fundraising_goal > 0 && (
                <div className="mt-2 flex justify-between text-xs text-on-surface-variant">
                  <span>Funds raised</span><span>{fundPct}%</span>
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button onClick={handleJoin} disabled={joined} className="rounded-xl">
                <Heart className="h-4 w-4 mr-2" /> {joined ? "Supporting" : "Support this temple"}
              </Button>
              <a href={templeCallUrl(temple.slug)} target="_blank" rel="noreferrer">
                <Button variant="outline" className="rounded-xl"><Video className="h-4 w-4 mr-2" /> Start call</Button>
              </a>
              <span className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant ml-1">
                <Users className="h-4 w-4" /> {members.length} supporter{members.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="mx-auto max-w-6xl px-4 py-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <Tabs defaultValue="feed">
            <TabsList className="mb-4">
              <TabsTrigger value="feed"><Megaphone className="h-4 w-4 mr-1.5" /> Feed</TabsTrigger>
              <TabsTrigger value="photos"><ImageIcon className="h-4 w-4 mr-1.5" /> Photos</TabsTrigger>
              <TabsTrigger value="requirements"><ListChecks className="h-4 w-4 mr-1.5" /> Requirements</TabsTrigger>
              <TabsTrigger value="chat"><MessageCircle className="h-4 w-4 mr-1.5" /> Chat</TabsTrigger>
            </TabsList>

            {/* Feed */}
            <TabsContent value="feed" className="space-y-4">
              <div className="rounded-2xl border border-border bg-surface p-4">
                <Textarea
                  value={postBody}
                  onChange={(e) => setPostBody(e.target.value)}
                  placeholder="Share an update, a requirement, or a milestone…"
                  className="min-h-[80px] rounded-xl border-0 ring-1 ring-border"
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(Object.keys(KIND_META) as PostKind[]).filter((k) => k !== "photo").map((k) => {
                    const M = KIND_META[k];
                    const active = postKind === k;
                    return (
                      <button
                        key={k}
                        onClick={() => setPostKind(k)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition ${
                          active ? "border-primary bg-primary/5 text-primary" : "border-border text-on-surface-variant"
                        }`}
                      >
                        <M.icon className="h-3.5 w-3.5" /> {M.label}
                      </button>
                    );
                  })}
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" id="temple-photo" />
                  <label htmlFor="temple-photo" className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border border-border text-on-surface-variant cursor-pointer hover:border-primary/50">
                    <Camera className="h-3.5 w-3.5" /> Photo
                  </label>
                  <Button onClick={handlePost} disabled={posting} size="sm" className="ml-auto rounded-full">
                    {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-3.5 w-3.5 mr-1.5" /> Post</>}
                  </Button>
                </div>
              </div>

              {posts.length === 0 && (
                <div className="text-center py-12 text-on-surface-variant text-sm">
                  Be the first to post — share the vision and rally support 🙏
                </div>
              )}
              {posts.map((p) => {
                const M = KIND_META[p.kind] ?? KIND_META.update;
                return (
                  <div key={p.id} className="rounded-2xl border border-border bg-surface p-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {initials(p.author_name)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{p.author_name || "Devotee"}</div>
                        <div className="text-xs text-on-surface-variant">{timeAgo(p.created_at)}</div>
                      </div>
                      <span className={`ml-auto inline-flex items-center gap-1 text-xs font-medium ${M.color}`}>
                        <M.icon className="h-3.5 w-3.5" /> {M.label}
                      </span>
                    </div>
                    {p.body && <p className="mt-3 text-sm whitespace-pre-wrap">{p.body}</p>}
                    {p.media_urls?.map((u) => (
                      <img key={u} src={u} alt="" className="mt-3 rounded-xl w-full max-h-[420px] object-cover border border-border" />
                    ))}
                  </div>
                );
              })}
            </TabsContent>

            {/* Photos */}
            <TabsContent value="photos">
              {photos.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant text-sm">No photos yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {photos.map((u) => (
                    <img key={u} src={u} alt="" className="rounded-xl aspect-square object-cover border border-border" />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Requirements */}
            <TabsContent value="requirements" className="space-y-3">
              {requirements.length === 0 ? (
                <div className="text-center py-12 text-on-surface-variant text-sm">No open requirements posted yet.</div>
              ) : (
                requirements.map((p) => (
                  <div key={p.id} className="rounded-xl border border-amber-300/50 bg-amber-50/40 p-4 flex gap-3">
                    <Flag className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm whitespace-pre-wrap">{p.body}</p>
                      <div className="text-xs text-on-surface-variant mt-1">{p.author_name || "Devotee"} · {timeAgo(p.created_at)}</div>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            {/* Chat */}
            <TabsContent value="chat">
              <div className="rounded-2xl border border-border bg-surface flex flex-col h-[460px]">
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {messages.length === 0 && (
                    <div className="text-center text-on-surface-variant text-sm py-10">Start the conversation 💬</div>
                  )}
                  {messages.map((m) => (
                    <div key={m.id} className="flex gap-2">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">
                        {initials(m.author_name)}
                      </div>
                      <div className="rounded-2xl bg-surface-container px-3 py-1.5">
                        <div className="text-[11px] font-semibold text-on-surface-variant">{m.author_name || "Devotee"}</div>
                        <div className="text-sm">{m.body}</div>
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t border-border p-3 flex gap-2">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Message the community…"
                    className="rounded-full"
                  />
                  <Button onClick={handleSend} size="icon" className="rounded-full shrink-0"><Send className="h-4 w-4" /></Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 font-semibold text-sm"><Bell className="h-4 w-4 text-primary" /> Get updates by email</div>
            <p className="text-xs text-on-surface-variant mt-1">Progress, milestones & requirements — straight to your inbox.</p>
            <div className="mt-3 flex gap-2">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" className="rounded-xl" />
              <Button onClick={handleSubscribe} className="rounded-xl shrink-0">Subscribe</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2 font-semibold text-sm mb-3"><Users className="h-4 w-4 text-primary" /> Supporters ({members.length})</div>
            {members.length === 0 ? (
              <p className="text-xs text-on-surface-variant">Be the first to support this temple.</p>
            ) : (
              <div className="space-y-2">
                {members.slice(0, 12).map((m) => (
                  <div key={m.device_id} className="flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{initials(m.name)}</div>
                    <span className="text-sm">{m.name || "Devotee"}</span>
                    {m.role === "organizer" && <span className="ml-auto text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">Organizer</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
