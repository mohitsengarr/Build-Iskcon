import { useMemo, useState } from "react";
import { useLocation, Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Sparkles, MapPin, Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fadeInUp } from "@/lib/animations";
import { INDIA_STATES, CITIES_BY_STATE, INDIA_CITY_COUNT } from "@/data/india-cities";
import ThreeTemple from "@/components/ThreeTemple";
import { createTemple, getAuthorName, setAuthorName, TEMPLE_STYLES, type TempleStyle } from "@/lib/communityTemples";

export default function DesignTemple() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [state, setState] = useState<string>("");
  const [city, setCity] = useState<string>("");
  const [style, setStyle] = useState<TempleStyle>("tovp-dome");
  const [name, setName] = useState("");
  const [deity, setDeity] = useState("");
  const [description, setDescription] = useState("");
  const [author, setAuthor] = useState(getAuthorName() === "Devotee" ? "" : getAuthorName());
  const [submitting, setSubmitting] = useState(false);

  const cities = useMemo(() => (state ? CITIES_BY_STATE[state] ?? [] : []), [state]);
  const selectedCity = useMemo(() => cities.find((c) => c.city === city) ?? null, [cities, city]);

  const canSubmit = !!name.trim() && !!state && !!city && !submitting;

  async function handleCreate() {
    if (!canSubmit) {
      toast({ title: "Almost there", description: "Add a temple name and pick a state & city." });
      return;
    }
    setSubmitting(true);
    try {
      if (author.trim()) setAuthorName(author.trim());
      const temple = await createTemple({
        name: name.trim(),
        deity: deity.trim() || undefined,
        style,
        state,
        city,
        lat: selectedCity?.lat ?? null,
        lng: selectedCity?.lng ?? null,
        description: description.trim() || undefined,
      });
      toast({ title: "🪷 Temple manifested", description: `${temple.name} now has its own community page.` });
      setLocation(`/temple/${temple.slug}`);
    } catch (e) {
      toast({
        title: "Couldn't create the temple",
        description: e instanceof Error ? e.message : "Please try again in a moment.",
        variant: "destructive",
      });
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <SEOHead
        title="Design Your Temple"
        description="Manifest a temple anywhere in India — pick a city, design it in 3D, and open a community page where devotees gather, contribute, and track progress."
      />

      <div className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-on-surface-variant hover:text-primary mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to home
        </Link>

        <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="mb-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> Vision 2051 · {INDIA_CITY_COUNT} cities
          </span>
          <h1 className="mt-3 text-3xl md:text-4xl font-bold tracking-tight">Design Your Temple</h1>
          <p className="mt-2 max-w-2xl text-on-surface-variant">
            Choose a location, shape it in 3D, and open a living community page where devotees rally to help
            manifest it — posts, photos, progress, chat, and calls, just like a group.
          </p>
        </motion.div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.05fr]">
          {/* form */}
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1.5 block">State / UT</Label>
                <Select value={state} onValueChange={(v) => { setState(v); setCity(""); }}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="Select a state" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {INDIA_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5 block">City</Label>
                <Select value={city} onValueChange={setCity} disabled={!state}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder={state ? "Select a city" : "Pick a state first"} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {cities.map((c) => (
                      <SelectItem key={c.city} value={c.city}>{c.city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Architecture style</Label>
              <div className="grid grid-cols-2 gap-3">
                {TEMPLE_STYLES.map((s) => {
                  const active = style === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setStyle(s.key)}
                      className={`text-left rounded-xl border p-3 transition ${
                        active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="text-sm font-semibold">{s.label}</div>
                      <div className="text-xs text-on-surface-variant mt-0.5">{s.blurb}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="mb-1.5 block">Temple name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Sri Radha Madhava Mandir" className="h-12 rounded-xl" />
            </div>
            <div>
              <Label className="mb-1.5 block">Presiding deity <span className="text-on-surface-variant font-normal">(optional)</span></Label>
              <Input value={deity} onChange={(e) => setDeity(e.target.value)} placeholder="Sri Sri Radha Krishna" className="h-12 rounded-xl" />
            </div>
            <div>
              <Label className="mb-1.5 block">Your vision <span className="text-on-surface-variant font-normal">(optional)</span></Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the temple you want to see manifested here…" className="min-h-[110px] rounded-xl" />
            </div>
            <div>
              <Label className="mb-1.5 block">Your name</Label>
              <Input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="How devotees will see you" className="h-12 rounded-xl" />
            </div>

            <Button onClick={handleCreate} disabled={!canSubmit} size="lg" className="w-full h-12 rounded-xl text-base">
              {submitting ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Manifesting…</>) : (<><Sparkles className="h-4 w-4 mr-2" /> Manifest this temple</>)}
            </Button>
          </div>

          {/* live 3D preview */}
          <div className="lg:sticky lg:top-24 h-fit">
            <div className="rounded-2xl overflow-hidden border border-border bg-[#fbf6ee] shadow-sm">
              <div className="h-[360px] md:h-[440px]">
                <ThreeTemple style={style} autoRotate interactive />
              </div>
              <div className="p-4 border-t border-border bg-surface">
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span className="font-medium">{city || "Your city"}{state ? `, ${state}` : ""}</span>
                </div>
                <div className="mt-1 text-xs text-on-surface-variant">
                  {TEMPLE_STYLES.find((s) => s.key === style)?.label} · drag to rotate
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
