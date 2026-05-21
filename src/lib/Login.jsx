import { useState } from 'react';
import { useAuth } from '@/lib/AuthProvider';
import { Button } from '@/components/ui/button';
import { UserX } from 'lucide-react';

export default function Login() {
  const { signIn, signUp, signInAsGuest } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const fn = isSignUp ? signUp : signIn;
    const { error } = await fn(email, password);
    if (error) setMsg(error.message);
    else if (isSignUp) setMsg('Check email to confirm (or disable confirm in Supabase).');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border/30 bg-card/60 p-6">
        <h1 className="font-display text-2xl text-center">Lunaria Cafe</h1>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          required
        />
        {msg && <p className="text-sm text-amber-400">{msg}</p>}
        <Button type="submit" className="w-full">
          {isSignUp ? 'Create account' : 'Log in'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground w-full"
          onClick={() => setIsSignUp(!isSignUp)}
        >
          {isSignUp ? 'Already have an account? Log in' : 'New here? Sign up'}
        </button>

        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-xs text-muted-foreground/40">or</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        <button
          type="button"
          onClick={signInAsGuest}
          className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50 hover:text-muted-foreground w-full transition-colors"
        >
          <UserX className="w-3 h-3" />
          Play as Guest
        </button>
      </form>
    </div>
  );
}