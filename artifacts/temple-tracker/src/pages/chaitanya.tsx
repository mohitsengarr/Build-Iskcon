import { Layout } from "@/components/layout/Layout";
import { SEOHead } from "@/components/SEOHead";
import { Loader2, BookOpen, FileText, CheckCircle2, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "@/lib/animations";

// Source PDFs that will feed the OCR + scene-extraction pipeline. Sourced from
// the user's iCloud Spiritual Books library and copied into the repo at
// data/chaitanya/pdfs/adi-lila/. Once the pipeline runs each entry flips from
// "pending" → "processing" → "ready" and the reader becomes available.
const ADI_LILA_CHAPTERS = [
  { num: 0, label: "Introduction", title: "भूमिका" },
  { num: 1, label: "Chapter 1", title: "अध्याय एक — आध्यात्मिक गुरुओं की वंशावली" },
  { num: 2, label: "Chapter 2", title: "अध्याय दो — श्री चैतन्य महाप्रभु, परम सत्य" },
  { num: 3, label: "Chapter 3", title: "अध्याय तीन — श्री चैतन्य के अवतार के बाह्य कारण" },
  { num: 4, label: "Chapter 4", title: "अध्याय चार — श्री चैतन्य के अवतार के अंतर्तम कारण" },
  { num: 5, label: "Chapter 5", title: "अध्याय पाँच — श्री नित्यानन्द बलराम की महिमा" },
  { num: 6, label: "Chapter 6", title: "अध्याय छह — श्री अद्वैत आचार्य की महिमा" },
  { num: 7, label: "Chapter 7", title: "अध्याय सात — पंच-तत्त्व" },
  { num: 8, label: "Chapter 8", title: "अध्याय आठ — लेखक मंगलाचरण" },
  { num: 9, label: "Chapter 9", title: "अध्याय नौ — कल्पवृक्ष" },
  { num: 10, label: "Chapter 10", title: "अध्याय दस — श्री चैतन्य के मुख्य अनुयायी" },
  { num: 11, label: "Chapter 11", title: "अध्याय ग्यारह — नित्यानन्द शाखा" },
  { num: 12, label: "Chapter 12", title: "अध्याय बारह — अद्वैताचार्य शाखा" },
  { num: 13, label: "Chapter 13", title: "अध्याय तेरह — श्री चैतन्य का प्राकट्य" },
  { num: 14, label: "Chapter 14", title: "अध्याय चौदह — भगवान का बाल्यकाल" },
  { num: 15, label: "Chapter 15", title: "अध्याय पन्द्रह — पौगंड लीला" },
  { num: 16, label: "Chapter 16", title: "अध्याय सोलह — कैशोर लीला" },
  { num: 17, label: "Chapter 17", title: "अध्याय सत्रह — कैशोर लीलाएँ" },
];

export default function Chaitanya() {
  return (
    <Layout>
      <SEOHead
        title="Chaitanya Charitamrit — Build Iskcon"
        description="The transcendental biography of Sri Caitanya Mahaprabhu — Adi-lila, Madhya-lila, and Antya-lila. Hindi edition with AI-assisted reading aids, character art, and scene illustrations. Currently in OCR processing."
      />
      <div className="max-w-5xl mx-auto px-4 sm:px-8 py-10">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="text-center mb-10">
          <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 bg-amber-100/60 text-amber-700 px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-4">
            <BookOpen className="w-3.5 h-3.5" /> CHAITANYA CHARITAMRIT
          </motion.div>
          <motion.h1 variants={fadeInUp} className="font-serif text-3xl sm:text-4xl font-bold text-stone-800 mb-3">
            श्री चैतन्य चरितामृत
          </motion.h1>
          <motion.p variants={fadeInUp} className="text-stone-600 text-base max-w-2xl mx-auto leading-relaxed mb-2">
            The transcendental biography of Sri Caitanya Mahaprabhu by Srila Krishnadasa Kaviraja Goswami.
          </motion.p>
          <motion.p variants={fadeInUp} className="text-stone-500 text-sm max-w-2xl mx-auto leading-relaxed">
            Hindi edition · Adi-lila · with AI-assisted reading aids, scene illustrations, and character art — same pipeline as Bhagwatham.
          </motion.p>
        </motion.div>

        {/* Processing status banner */}
        <div className="mb-8 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-600 flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-serif font-bold text-amber-900 text-base mb-1">
                OCR pipeline in progress
              </h3>
              <p className="text-sm text-amber-800 leading-relaxed">
                The {ADI_LILA_CHAPTERS.length} chapters of Adi-lila have been ingested as PDFs and are queued for the OCR + scene-extraction + image-generation pipeline that already powers Bhagwatham. The reader, gallery, and Bhaktigram integrations will light up as each chapter completes processing.
              </p>
              <ul className="text-[12px] text-amber-700 mt-3 space-y-1 list-disc list-inside leading-relaxed">
                <li><strong>Pages → text:</strong> Sarvam OCR per page, batched into JSON</li>
                <li><strong>Text → scenes:</strong> Claude Haiku 4.5 extracts 3-5 narratively-central scenes per chapter</li>
                <li><strong>Scenes → images:</strong> FLUX.2-pro generates Raja Ravi Varma-style cover art (landscape) + IG posts (portrait)</li>
                <li><strong>Persona-aware:</strong> Sri Caitanya, Nityananda, Advaita Acharya, Gadadhara, Srivasa, etc. detected and looked up against canonical descriptions</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Chapter manifest */}
        <h2 className="text-stone-800 font-serif text-xl font-bold mb-4">Adi-lila chapters</h2>
        <div className="bg-white border border-stone-200 rounded-2xl divide-y divide-stone-100">
          {ADI_LILA_CHAPTERS.map((ch) => (
            <div key={ch.num} className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center shrink-0 text-stone-600 text-xs font-bold">
                {ch.num === 0 ? "—" : ch.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">{ch.label}</div>
                <div className="text-sm text-stone-800 font-medium" style={{ fontFamily: "var(--font-devanagari)" }}>{ch.title}</div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-100/60 px-2 py-1 rounded-full shrink-0">
                <Clock className="w-3 h-3" /> Queued
              </div>
            </div>
          ))}
        </div>

        {/* Reader access note */}
        <div className="mt-8 text-center text-xs text-stone-500">
          <p>While Chaitanya Charitamrit is being processed, you can read the fully-online <a href="/bhagwatham" className="text-orange-700 font-semibold hover:underline">Srimad Bhagwatham</a> built on the same pipeline.</p>
        </div>
      </div>
    </Layout>
  );
}
