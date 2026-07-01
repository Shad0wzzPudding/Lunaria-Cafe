import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { guestStorage } from '@/lib/guestStorage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);

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

  const signUp = (email, password) =>
    supabase?.auth.signUp({ email, password });

  const signIn = (email, password) =>
    supabase?.auth.signInWithPassword({ email, password });

  const signOut = () => {
    setIsGuest(false);
    if (!supabase) {
      guestStorage.clear();
      return Promise.resolve();
    }
    return supabase.auth.signOut().then(() => guestStorage.clear());
  };

  const signInAsGuest = () => setIsGuest(true);

  return (
    <AuthContext.Provider value={{ user, loading, isGuest, signUp, signIn, signOut, signInAsGuest }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}