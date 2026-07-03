import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { guestStorage } from '@/lib/guestStorage';

const AuthContext = createContext(null);

// Session-scoped so a dual-role user re-picks on each new tab/visit.
const roleStorageKey = (userId) => `lunaria-active-role:${userId}`;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [activeRole, setActiveRole] = useState(null); // 'student' | 'instructor' | null

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

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
    if (!supabase || !user) {
      setProfile(null);
      setActiveRole(null);
      return;
    }

    let cancelled = false;
    setProfileLoading(true);

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
      })
      .finally(() => { if (!cancelled) setProfileLoading(false); });

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

  return (
    <AuthContext.Provider
      value={{
        user, profile, loading, profileLoading, isGuest,
        activeRole, chooseRole,
        signUp, signIn, signOut, signInAsGuest,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
