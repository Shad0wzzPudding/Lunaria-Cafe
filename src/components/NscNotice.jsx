import { useEffect, useState } from 'react';
import { FileText, ShieldCheck, Check, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/auth/useAuth';
import { consentStatement, licenseParagraphs, privacyStatement } from '@/lib/nsc/licenseText';
import PrivacyNoticeBody from '@/components/PrivacyNoticeBody';
import { INSTRUCTOR_PAGE_BG, INSTRUCTOR_PAGE_INK as PAGE_INK } from '@/lib/theme/themeDeriver';

// Legal text must stay readable — Silkscreen renders lowercase as caps-like
// glyphs, so the document body uses the same real font as form inputs.
const DOC_FONT = "'Inter Variable', system-ui, sans-serif";

// Instructors get the plain-document treatment: same acknowledgement the
// players give inside Lulyssia's letter, minus the pixel envelope and the
// starter pack, which belong to the game they never mount.
const LICENSE_PARAGRAPHS = licenseParagraphs({ ink: '#4a4560', teamInk: false });

/**
 * One consent checkbox: sr-only input, drawn box, focus ring on the box.
 *
 * Extracted once this page needed two of them. LicenseEnvelope keeps its own
 * version — the palettes and shapes have nothing in common (pixel/cream there,
 * rounded/white here) and only the structure is shared, so a single control
 * with a variant flag would carry both designs to no benefit.
 */
function ConsentBox({ checked, disabled, onChange, children }) {
  return (
    <label className={`flex items-start gap-3 select-none ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[3px] border-2 border-[#6b5a9c] peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#6b5a9c]"
        style={{ background: checked ? '#6b5a9c' : '#ffffff' }}
      >
        {checked && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
      </span>
      <span className="text-[13px] leading-relaxed text-[#4a4560]" style={{ fontFamily: DOC_FONT }}>
        {children}
      </span>
    </label>
  );
}

/**
 * The NSC notice, rendered INSTEAD of the instructor dashboard until accepted.
 *
 * Replacing the page rather than floating over it is deliberate: there is no
 * dashboard behind to tab into, so this needs no inert wrapper and no focus
 * trap, and it reads as a document to sign rather than a dialog to dismiss.
 */
export default function NscNotice() {
  const { profile, user, acceptNscNotice, signOut } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  // Locked until the notice has been read to the end — see the player gate for
  // the same rule. This page scrolls the WINDOW rather than a container, so it
  // watches scroll events instead of a div's onScroll.
  const [privacyRead, setPrivacyRead] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const bothTicked = agreed && privacyAgreed;

  useEffect(() => {
    if (!showPrivacy || privacyRead) return undefined;
    const check = () => {
      const doc = document.documentElement;
      // The `not scrollable at all` case is load-bearing: on a tall window the
      // notice fits, no scroll event ever fires, and without this the box could
      // never be ticked and the instructor would be stuck on this page.
      if (doc.scrollHeight <= window.innerHeight + 2 ||
          window.scrollY + window.innerHeight >= doc.scrollHeight - 8) {
        setPrivacyRead(true);
      }
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [showPrivacy, privacyRead]);

  const accept = async () => {
    setSaving(true);
    setError('');
    const { error: err } = await acceptNscNotice();
    // Leave the notice up on failure — the acknowledgement has to be recorded,
    // and silently continuing would lose it.
    if (err) {
      setError(err.message || 'Could not record your acknowledgement. Please try again.');
      setSaving(false);
      return;
    }
    // Success clears `saving` too, even though the stamped profile normally
    // unmounts this component a moment later. Relying on that unmount as the
    // reset is a silent trap: if this branch ever stops unmounting, the button
    // sticks on "Recording…" with no way out but a reload. React 18+ no-ops a
    // setState on an unmounted component, so paying for it here is free.
    setSaving(false);
  };

  // The notice gets its own page rather than a third card on this one. It is
  // long, and a reader who has to scroll past it to reach the checkbox will
  // scroll past it without reading.
  if (showPrivacy) {
    return (
      <div className={`min-h-screen ${PAGE_INK} py-10 px-4`} style={{ background: INSTRUCTOR_PAGE_BG }}>
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="font-display text-xl text-[#3b3550]">Privacy Notice</h1>
          {/* At the TOP, not the bottom: this page scrolls the window, so a
              hint placed at the end is only seen by someone who already did
              the thing it asks for. */}
          {!privacyRead && (
            <p className="font-body text-sm text-[#6f6890]">
              Scroll to the end of this notice to enable the acknowledgement.
            </p>
          )}
          <section className="rounded-xl border border-black/10 bg-white/70 p-6">
            <PrivacyNoticeBody
              font={DOC_FONT}
              headingColor="#3b3550"
              bodyColor="#4a4560"
              mutedColor="#6f6890"
              ruleColor="rgba(0,0,0,0.1)"
            />
          </section>
          <Button onClick={() => setShowPrivacy(false)} className="font-pixel text-xs">
            ← Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${PAGE_INK} py-10 px-4`} style={{ background: INSTRUCTOR_PAGE_BG }}>
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="space-y-1">
          <h1 className="font-display text-xl text-[#3b3550]">Before you continue</h1>
          <p className="font-body text-sm">
            Signed in as {profile?.display_name || user?.email}. Please read and acknowledge
            the following.
          </p>
        </header>

        <section className="rounded-xl border border-black/10 bg-white/70 p-6">
          <h2 className="font-display text-base text-[#3b3550] mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" aria-hidden="true" />
            License Agreement
          </h2>
          <div className="space-y-3" style={{ fontFamily: DOC_FONT }}>
            {LICENSE_PARAGRAPHS.map((para, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-[#4a4560]">{para}</p>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-black/10 bg-white/70 p-6">
          <h2 className="font-display text-base text-[#3b3550] mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            Data & Privacy
          </h2>
          <div className="space-y-3 text-[13px] leading-relaxed text-[#4a4560]" style={{ fontFamily: DOC_FONT }}>
            <p>
              The attention camera runs entirely in the student&apos;s own browser. No video,
              images, or camera data are transmitted, stored, or collected — only the
              resulting focus score becomes part of their save.
            </p>
            <p>
              As an instructor you can see the progress figures your students&apos; sessions
              produce — focus score, reputation, coins, and time — for the classrooms you
              own. Their private journal entries are never shown to you.
            </p>
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="underline underline-offset-2 text-[#6b5a9c] hover:text-[#3b3550]"
            >
              Read the full Privacy Notice →
            </button>
          </div>
        </section>

        <section className="rounded-xl border border-black/10 bg-white/70 p-6 space-y-3">
          <ConsentBox checked={agreed} disabled={saving} onChange={setAgreed}>
            {/* Not "my own device" — the camera runs on the students'
                machines, never on the instructor's. */}
            I acknowledge that {consentStatement({ voice: 'instructor' })}
          </ConsentBox>

          <ConsentBox
            checked={privacyAgreed}
            disabled={saving || !privacyRead}
            onChange={setPrivacyAgreed}
          >
            {privacyStatement({ voice: 'instructor' })}
          </ConsentBox>
          {/* Directly under the checkbox's own text, indented to line up with
              it — a disabled control needs its reason beside it. */}
          {!privacyRead && (
            <p className="pl-[30px] text-[12px] text-[#6f6890]" style={{ fontFamily: DOC_FONT }}>
              Read the Privacy Notice in Data &amp; Privacy section to the end first to enable this.
            </p>
          )}

          {error && (
            <p className="mt-3 text-[13px] text-red-700" style={{ fontFamily: DOC_FONT }} role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-3">
            <Button
              variant="ghost"
              onClick={signOut}
              className="font-pixel text-xs gap-2 text-[#57506a] hover:text-[#3b3550]"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign out
            </Button>
            <Button
              onClick={accept}
              disabled={!bothTicked || saving}
              className="font-pixel text-xs"
            >
              {saving ? 'Recording…' : 'Acknowledge and continue'}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
