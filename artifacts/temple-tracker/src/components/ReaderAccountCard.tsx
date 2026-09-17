// React in scope, as in the reader pages: the app's vitest config compiles JSX
// with the classic transform, which calls React.createElement.
import React from "react";
import { LogIn, LogOut } from "lucide-react";

// The reader's identity card at the foot of the book sidebars (Bhagavatam and
// Chaitanya Charitamrita). Signing in only saves an email and name in this
// browser; signing out forgets them and clears the bookmarks on screen.
//
// Sign out used to be a bare X icon that signed out on the first click, so a
// reader who meant to close the sidebar lost their identity. It is now a
// labelled button, and it asks before doing anything: Cancel has the focus, so
// Enter or Escape keeps the reader signed in.

interface ReaderAccountCardProps {
  readerId: string | null;
  readerName: string | null;
  onLogin: () => void;
  onLogout: () => void;
}

export function ReaderAccountCard({ readerId, readerName, onLogin, onLogout }: ReaderAccountCardProps) {
  const [confirming, setConfirming] = React.useState(false);
  // A different identity (or none) always starts from the plain card.
  React.useEffect(() => { setConfirming(false); }, [readerId]);
  return (
    <ReaderAccountCardView
      readerId={readerId}
      readerName={readerName}
      confirming={confirming}
      onLogin={onLogin}
      onAskSignOut={() => setConfirming(true)}
      onCancelSignOut={() => setConfirming(false)}
      onConfirmSignOut={() => { setConfirming(false); onLogout(); }}
    />
  );
}

interface ReaderAccountCardViewProps {
  readerId: string | null;
  readerName: string | null;
  confirming: boolean;
  onLogin: () => void;
  onAskSignOut: () => void;
  onCancelSignOut: () => void;
  onConfirmSignOut: () => void;
}

/** The card for a given state, with no state of its own (rendered directly by the tests). */
export function ReaderAccountCardView({
  readerId,
  readerName,
  confirming,
  onLogin,
  onAskSignOut,
  onCancelSignOut,
  onConfirmSignOut,
}: ReaderAccountCardViewProps) {
  if (!readerId) {
    return (
      <button
        onClick={onLogin}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-xs font-semibold transition-colors"
      >
        <LogIn className="w-3.5 h-3.5" /> Sign in to save bookmarks
      </button>
    );
  }

  const onConfirmKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") onCancelSignOut();
  };

  return (
    <div className="px-2 py-2 rounded-lg bg-orange-50/60">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
          {(readerName || readerId).slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-stone-700 truncate">
            {readerName || "Signed in"}
          </p>
          <p className="text-[10px] text-stone-500 truncate">
            {readerId}
          </p>
        </div>
      </div>

      {confirming ? (
        <div
          role="alertdialog"
          aria-label="Confirm sign out"
          onKeyDown={onConfirmKeyDown}
          className="mt-2 pt-2 border-t border-orange-100"
        >
          <p className="text-[11px] text-stone-600 mb-2 break-words">
            Sign out of {readerId}?
          </p>
          <div className="flex gap-2">
            <button
              autoFocus
              onClick={onCancelSignOut}
              className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-stone-600 bg-white border border-stone-200 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirmSignOut}
              className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onAskSignOut}
          className="mt-2 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-semibold text-stone-600 bg-white border border-stone-200 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      )}
    </div>
  );
}
