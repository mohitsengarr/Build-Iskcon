// ── Source Editor ─────────────────────────────────────────────────────────────
// A proper CodeMirror-6 editor over the RAW page text, with a live preview from
// the existing renderer. This replaces the old "select rendered text → fuzzy-match
// back to source → patch" flow (VoiceEditToolbar/applyEdit), which was the root of
// a long tail of bugs: the rendered DOM and the raw OCR source diverge (bold `**`
// markers, cleanOcrText corrections, injected section labels, whitespace), so every
// edit had to guess where the selection lived in the source.
//
// Here the editor IS the source. Selections are real document offsets, so:
//   • "Bold"   wraps the exact selected range in `**…**` (no locating).
//   • "AI fix" sends the exact selected span (+ real surrounding context) to the
//     correction endpoint and replaces that exact range with the suggestion.
//   • "Save"   persists the full page text — one canonical string, no reconstruction.
//   • ⌘Z / ⌘⇧Z undo/redo come from CodeMirror's built-in history.
//
// Shared by the Bhagavatam and Chaitanya readers. The pretty reader view is
// unchanged; this is a maintainer edit surface (dev-gated by the caller).

import { useState, useRef, useEffect, useCallback } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { X, Save, Bold, Wand2, Loader2, Info, ChevronLeft, ChevronRight } from "lucide-react";

export interface AiFixArgs {
  selectedText: string;
  contextBefore: string;
  contextAfter: string;
  pageNumber: number;
}

interface SourceEditorProps {
  pageNumber: number;
  initialText: string;
  /** Render the live preview from the current buffer (pass the reader's RenderContent). */
  renderPreview: (text: string) => React.ReactNode;
  /** Persist the full page text. Throw/reject on failure so the editor can surface it. */
  onSave: (pageNumber: number, text: string) => Promise<void>;
  /** Ask the correction endpoint to fix a span; resolve with corrected text (or null to skip). */
  requestAiFix: (args: AiFixArgs) => Promise<string | null>;
  onClose: () => void;
  /** Optional dark styling hint from the reader's theme. */
  dark?: boolean;
  /** Adjacent loaded page numbers — enable prev/next so a verse that spans a page
   *  boundary can be fixed on each page in turn (each page's source is clean). */
  prevPageNumber?: number;
  nextPageNumber?: number;
  onNavigate?: (pageNumber: number) => void;
}

const CONTEXT_CHARS = 600; // per side — matches the correction endpoint's window

export default function SourceEditor({
  pageNumber,
  initialText,
  renderPreview,
  onSave,
  requestAiFix,
  onClose,
  dark = false,
  prevPageNumber,
  nextPageNumber,
  onNavigate,
}: SourceEditorProps) {
  const [text, setText] = useState(initialText);
  const [previewText, setPreviewText] = useState(initialText);
  // `baseline` is the last-saved text — the dirty check compares against it so a
  // successful Save clears the "unsaved" state without needing a prop change.
  const [baseline, setBaseline] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const viewRef = useRef<EditorView | null>(null);

  const dirty = text !== baseline;

  // Debounce the (heavy) preview render so typing stays smooth.
  useEffect(() => {
    const t = setTimeout(() => setPreviewText(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  const handleClose = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes to this page?")) return;
    onClose();
  }, [dirty, onClose]);

  const navTo = useCallback((pn?: number) => {
    if (pn == null || !onNavigate) return;
    if (dirty && !window.confirm("Discard unsaved changes to this page?")) return;
    onNavigate(pn);
  }, [dirty, onNavigate]);

  const handleSave = useCallback(async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(pageNumber, text);
      setBaseline(text); // re-baseline → dirty clears
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } catch (err) {
      setError(`Save failed: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setSaving(false);
    }
  }, [saving, dirty, onSave, pageNumber, text]);

  // Wrap / unwrap the current selection in `**…**` (toggle).
  const toggleBold = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const sel = view.state.sliceDoc(from, to);
    if (sel) {
      if (sel.startsWith("**") && sel.endsWith("**") && sel.length >= 4) {
        const inner = sel.slice(2, -2);
        view.dispatch({ changes: { from, to, insert: inner }, selection: { anchor: from, head: from + inner.length } });
      } else {
        const wrapped = `**${sel}**`;
        view.dispatch({ changes: { from, to, insert: wrapped }, selection: { anchor: from, head: from + wrapped.length } });
      }
    } else {
      // No selection: insert an empty pair and park the cursor between the markers.
      view.dispatch({ changes: { from, insert: "****" }, selection: { anchor: from + 2 } });
    }
    view.focus();
  }, []);

  // Correct the selected span (or the current line if nothing is selected) via AI.
  const runAiFix = useCallback(async () => {
    const view = viewRef.current;
    if (!view || aiLoading) return;
    let { from, to } = view.state.selection.main;
    if (from === to) {
      const line = view.state.doc.lineAt(from);
      from = line.from;
      to = line.to;
    }
    const selectedText = view.state.sliceDoc(from, to).trim();
    if (selectedText.length < 2) {
      setError("Select a couple of characters (or place the cursor on a line) to AI-fix.");
      return;
    }
    const docStr = view.state.doc.toString();
    const contextBefore = docStr.slice(Math.max(0, from - CONTEXT_CHARS), from);
    const contextAfter = docStr.slice(to, to + CONTEXT_CHARS);
    setAiLoading(true);
    setError(null);
    try {
      const fixed = await requestAiFix({ selectedText, contextBefore, contextAfter, pageNumber });
      if (fixed != null && fixed !== selectedText) {
        // Exact-range replace — no fuzzy locating; that is the whole point.
        view.dispatch({ changes: { from, to, insert: fixed }, selection: { anchor: from, head: from + fixed.length } });
      }
    } catch (err) {
      setError(`AI fix failed: ${String(err instanceof Error ? err.message : err)}`);
    } finally {
      setAiLoading(false);
      view.focus();
    }
  }, [aiLoading, requestAiFix, pageNumber]);

  const editorTheme = EditorView.theme({
    "&": { fontSize: "15px", height: "100%" },
    ".cm-content": { fontFamily: "var(--font-devanagari, ui-sans-serif), system-ui", lineHeight: "1.9" },
    ".cm-scroller": { overflow: "auto" },
  });

  const btn = "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-white dark:bg-stone-900" role="dialog" aria-label={`Edit source — page ${pageNumber}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-stone-200 dark:border-stone-700 shrink-0">
        {onNavigate && (
          <div className="flex items-center gap-0.5">
            <button onClick={() => navTo(prevPageNumber)} disabled={prevPageNumber == null} className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed" title="Previous page">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => navTo(nextPageNumber)} disabled={nextPageNumber == null} className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-30 disabled:cursor-not-allowed" title="Next page (for verses that continue across the boundary)">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
        <span className="text-sm font-bold text-stone-800 dark:text-stone-100">Edit source — Pg. {pageNumber}</span>
        {dirty && <span className="text-[11px] font-semibold text-amber-600">● unsaved</span>}
        {savedFlash && <span className="text-[11px] font-semibold text-green-600">✓ saved</span>}
        <div className="flex items-center gap-1.5 ml-auto">
          <button onClick={toggleBold} className={`${btn} bg-stone-100 text-stone-700 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-200`} title="Wrap selection in ** ** (bold)">
            <Bold className="w-3.5 h-3.5" /> Bold
          </button>
          <button onClick={runAiFix} disabled={aiLoading} className={`${btn} bg-purple-100 text-purple-700 hover:bg-purple-200`} title="AI-correct the selected span (or current line)">
            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />} AI fix
          </button>
          <button onClick={handleSave} disabled={saving || !dirty} className={`${btn} bg-orange-600 text-white hover:bg-orange-700`} title="Save this page to the server">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save
          </button>
          <button onClick={handleClose} className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-1.5 text-[11px] text-red-700 bg-red-50 border-b border-red-200 shrink-0">{error}</div>
      )}

      {/* Split: editor | live preview */}
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-stone-200 dark:divide-stone-700">
        {/* Editor pane */}
        <div className="min-h-0 overflow-hidden flex flex-col">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400 border-b border-stone-100 dark:border-stone-800 flex items-center gap-1.5">
            <Info className="w-3 h-3" /> Raw source · **bold** · blank line = new section · ⌘Z undo
          </div>
          <div className="flex-1 min-h-0">
            <CodeMirror
              value={text}
              onChange={setText}
              onCreateEditor={(view) => { viewRef.current = view; }}
              extensions={[EditorView.lineWrapping, editorTheme]}
              theme={dark ? "dark" : "light"}
              basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true, bracketMatching: false, closeBrackets: false }}
              height="100%"
              style={{ height: "100%" }}
            />
          </div>
        </div>

        {/* Preview pane */}
        <div className="min-h-0 overflow-auto">
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-stone-400 border-b border-stone-100 dark:border-stone-800 sticky top-0 bg-white dark:bg-stone-900 z-10">
            Live preview
          </div>
          <div className="px-4 py-4">
            {renderPreview(previewText)}
          </div>
        </div>
      </div>
    </div>
  );
}
