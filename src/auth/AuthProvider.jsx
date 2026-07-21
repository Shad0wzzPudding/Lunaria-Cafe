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
      .catch((err) => console.error('[auth] getSession failed:', err))
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
        if (error) console.error('[auth] profile fetch failed:', error);
        // No row and no error → the account was deleted but the login
        // token is still alive. End the ghost session.
        if (!data && !error) {
          console.warn('[auth] no profile for user — signing out');
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

  return (
    <AuthContext.Provider
      value={{
        user, profile: freshProfile, loading, profileLoading, isGuest,
        activeRole, chooseRole,
        signUp, signIn, signOut, signInAsGuest, updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
