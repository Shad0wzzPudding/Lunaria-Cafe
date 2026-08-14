import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { guestStorage } from '@/lib/guestStorage';
import { AuthContext } from './authContext';

// Session-scoped so a dual-role user re-picks on each new tab/visit.
const roleStorageKey = (userId) => `lunaria-active-role:${userId}`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  // Last fetched profile — may belong to a previous user; see freshProfile.
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(supabase));
  const [isGuest, setIsGuest] = useState(false);
  // Network/auth trouble that the app used to swallow into console.error. Both
  // failures below change what the player sees — one drops them at the login
  // screen, the other quietly downgrades their role — so neither should be
  // invisible.
  const [authError, setAuthError] = useState(null);
  const [activeRole, setActiveRole] = useState(null); // 'student' | 'instructor' | null

  // Derived: the profile only counts once it belongs to the current user.
  const freshProfile = user && profile?.id === user.id ? profile : null;
  const profileLoading = Boolean(supabase) && Boolean(user) && !freshProfile;

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setUser(session?.user ?? null);
      })
      .catch((err) => {
        console.error('[auth] getSession failed:', err);
        setAuthError('Could not reach the server to check your login. You may be offline.');
      })
      .finally(() => setLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) setIsGuest(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the profile (role flags) whenever the signed-in user changes.
  useEffect(() => {
    if (!supabase || !user) return;

    let cancelled = false;

    supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed fetch falls back to a plain student below. That is a real
        // downgrade — an instructor would land in the game instead of their
        // dashboard — so say so rather than letting it look intentional.
        if (error) {
          console.error('[auth] profile fetch failed:', error);
          setAuthError('Could not load your account details, so some features may be missing. Reload once you are back online.');
        } else {
          setAuthError(null);
        }
        // No row and no error → the account was deleted but the login
        // token is still alive. End the ghost session.
        if (!data && !error) {
          console.warn('[auth] no profile for user — signing out');
          // Say why. Without this the sign-out is indistinguishable from the
          // session simply expiring, and the player retries a password that was
          // never the problem — the same gap the two branches above just closed.
          setAuthError('Your account is no longer available, so you have been signed out.');
          supabase.auth.signOut();
          return;
        }
        // Fetch error (e.g. offline) → degrade to plain student.
        const p = data ?? { id: user.id, is_student: true, is_instructor: false };
        setProfile(p);

        if (p.is_student && p.is_instructor) {
          const saved = sessionStorage.getItem(roleStorageKey(user.id));
          setActiveRole(saved === 'student' || saved === 'instructor' ? saved : null);
        } else {
          setActiveRole(p.is_instructor ? 'instructor' : 'student');
        }
      });

    return () => { cancelled = true; };
  }, [user]);

  const chooseRole = (role) => {
    if (user) sessionStorage.setItem(roleStorageKey(user.id), role);
    setActiveRole(role);
  };

  const signUp = (email, password, meta = {}) =>
    supabase?.auth.signUp({ email, password, options: { data: meta } });

  const signIn = (email, password) =>
    supabase?.auth.signInWithPassword({ email, password });

  const signOut = () => {
    setIsGuest(false);
    if (user) sessionStorage.removeItem(roleStorageKey(user.id));
    if (!supabase) {
      guestStorage.clear();
      return Promise.resolve();
    }
    return supabase.auth.signOut().then(() => guestStorage.clear());
  };

  const signInAsGuest = () => setIsGuest(true);

  // Rename the account. Routed through the update_display_name RPC, which
  // enforces the student-only rule and only touches display_name (direct
  // profile writes are no longer permitted). On success, patch the local
  // profile so the new name shows immediately.
  const updateDisplayName = async (name) => {
    if (!supabase || !user) return { error: new Error('Not signed in') };
    const { data, error } = await supabase.rpc('update_display_name', { new_name: name });
    if (!error) {
      setProfile((p) => (p && p.id === user.id ? { ...p, display_name: data } : p));
    }
    return { data, error };
  };

  // Record that this account has read the NSC notice. Stamped on the profile
  // rather than in a save, because instructors never mount the game. The RPC
  // keeps the first acceptance, so calling it twice is harmless; on success we
  // patch the local profile to take the notice down without a refetch.
  const acceptNscNotice = async () => {
    if (!supabase || !user) return { error: new Error('Not signed in') };
    const { data, error } = await supabase.rpc('accept_nsc_notice');
    if (!error) {
      setProfile((p) => (p && p.id === user.id ? { ...p, nsc_consent_at: data } : p));
    }
    return { data, error };
  };

  // Open or close the cafe to friend visits. Server-side via RPC, because the
  // gate that matters is the one visit_friend_cafe() checks — this only decides
  // what the switch in Settings shows. Patch the local profile on success so
  // the switch moves immediately rather than after a refetch.
  const setCafeVisibility = async (open) => {
    if (!supabase || !user) return { error: new Error('Not signed in') };
    const { data, error } = await supabase.rpc('set_cafe_visibility', { _open: open });
    if (!error) {
      setProfile((p) => (p && p.id === user.id ? { ...p, cafe_open_to_friends: data } : p));
    }
    return { data, error };
  };

  // Clear the custom name so the app falls back to the email-derived default.
  const resetDisplayName = async () => {
    if (!supabase || !user) return { error: new Error('Not signed in') };
    const { error } = await supabase.rpc('reset_display_name');
    if (!error) {
      setProfile((p) => (p && p.id === user.id ? { ...p, display_name: null } : p));
    }
    return { error };
  };

  return (
    <AuthContext.Provider
      value={{
        user, profile: freshProfile, loading, profileLoading, isGuest, authError,
        activeRole, chooseRole,
        signUp, signIn, signOut, signInAsGuest, updateDisplayName, resetDisplayName,
        acceptNscNotice, setCafeVisibility,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
