// The temple builder's design controls: pick one of the 108 styles — twelve
// families in nine stones and finishes — then change any part of it.
//
// Three-free: it edits a TempleDesign (lib/templeDesign) and the page hands that
// to the 3D preview, so this file never pulls three.js into the page bundle.

import { useMemo, useState } from "react";
import { ChevronDown, Check, RotateCcw } from "lucide-react";
import {
  BASES, BODIES, CORNERS, CROWNS, FAMILIES, FINIALS, FINISHES, FINISH_SWATCH, OPTION_LABELS,
  PART_LABELS, PORCHES, PRESETS, STONES, STONE_SWATCH,
  designLabel, presetById, withPart, type PartKey, type TempleDesign,
} from "@/lib/templeDesign";

const PART_OPTIONS: Array<{ part: PartKey; options: readonly string[] }> = [
  { part: "crown", options: CROWNS },
  { part: "body", options: BODIES },
  { part: "porch", options: PORCHES },
  { part: "corners", options: CORNERS },
  { part: "finial", options: FINIALS },
  { part: "base", options: BASES },
  { part: "stone", options: STONES },
  { part: "finish", options: FINISHES },
];

function Swatch({ color, ring }: { color: string | null; ring?: boolean }) {
  if (!color) return null;
  return (
    <span
      aria-hidden
      className={`inline-block h-3.5 w-3.5 shrink-0 rounded-full border ${ring ? "border-primary" : "border-black/15"}`}
      style={{ background: color }}
    />
  );
}

export function TempleDesigner({
  design, basedOn, onChange,
}: {
  design: TempleDesign;
  /** The style it started from, for "Custom · from …" and Reset. */
  basedOn: string;
  onChange: (design: TempleDesign, basedOn: string) => void;
}) {
  const origin = presetById(basedOn) ?? PRESETS[0];
  const [familyKey, setFamilyKey] = useState(origin.family.key);
  const [open, setOpen] = useState(false);
  const variants = useMemo(() => PRESETS.filter((p) => p.family.key === familyKey), [familyKey]);
  const label = designLabel(design, basedOn);
  const custom = !design.preset;

  const choosePreset = (id: string) => {
    const p = presetById(id);
    if (p) onChange(p.design, p.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Architecture style</div>
          <div className="text-xs text-on-surface-variant">108 styles — 12 traditions, each in 9 stones and finishes</div>
        </div>
        <div className="text-xs font-semibold text-primary">{label}</div>
      </div>

      {/* The twelve families */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {FAMILIES.map((f) => {
          const active = f.key === familyKey;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFamilyKey(f.key); choosePreset(`${f.key}-classic`); }}
              className={`rounded-xl border p-2.5 text-left transition ${
                active ? "border-primary bg-primary/5 ring-2 ring-primary/30" : "border-border hover:border-primary/50"
              }`}
            >
              <div className="text-[13px] font-semibold leading-snug">{f.name}</div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-on-surface-variant">{f.blurb}</div>
            </button>
          );
        })}
      </div>

      {/* Its nine variants */}
      <div className="flex flex-wrap gap-2">
        {variants.map((p) => {
          const active = design.preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => choosePreset(p.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition ${
                active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:border-primary/50"
              }`}
            >
              <Swatch color={STONE_SWATCH[p.design.stone]} />
              <Swatch color={FINISH_SWATCH[p.design.finish]} />
              {p.variant}
            </button>
          );
        })}
      </div>

      {/* Every part, open to change */}
      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-semibold">Redesign each part</span>
            <span className="block text-xs text-on-surface-variant">Tower, walls, porch, corners, pinnacle, base, stone and finish</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="space-y-4 border-t border-border px-3.5 py-4">
            {PART_OPTIONS.map(({ part, options }) => (
              <div key={part}>
                <div className="mb-1.5 text-xs font-medium text-on-surface-variant">{PART_LABELS[part]}</div>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((value) => {
                    const active = design[part] === value;
                    const labels = OPTION_LABELS[part as keyof typeof OPTION_LABELS] as Record<string, string>;
                    const swatch = part === "stone" ? STONE_SWATCH[value as keyof typeof STONE_SWATCH]
                      : part === "finish" ? (value === "stone" ? STONE_SWATCH[design.stone] : FINISH_SWATCH[value as keyof typeof FINISH_SWATCH])
                      : null;
                    return (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(withPart(design, part, value as never), basedOn)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                          active ? "border-primary bg-primary/10 font-semibold text-primary" : "border-border hover:border-primary/50"
                        }`}
                      >
                        {swatch !== null && <Swatch color={swatch} ring={active} />}
                        {active && swatch === null && <Check className="h-3 w-3" aria-hidden />}
                        {labels[value]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {custom && (
              <button
                type="button"
                onClick={() => choosePreset(origin.id)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Back to {origin.name}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
