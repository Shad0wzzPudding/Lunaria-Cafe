import { useState } from 'react';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { UserX, AlertTriangle, GraduationCap, BookOpen, Eye, EyeOff } from 'lucide-react';
import { INSTRUCTOR_SECRET_CODE } from '@/lib/classroom/constants';

// The form's default font (Silkscreen) is uppercase-only, so credential fields
// override to a font with real lowercase glyphs — otherwise typed text renders
// as all caps even though the stored value is correct.
const FORM_FONT = { fontFamily: "'Inter Variable', sans-serif" };

export default function Login() {
  const [showGuestWarning, setShowGuestWarning] = useState(false);
  const { signIn, signUp, signInAsGuest, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [roleStudent, setRoleStudent] = useState(true);
  const [roleInstructor, setRoleInstructor] = useState(false);
  const [instructorCode, setInstructorCode] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');

    if (!isSignUp) {
      const { error } = await signIn(email, password);
      if (error) setMsg(error.message);
      return;
    }

    if (!roleStudent && !roleInstructor) {
      setMsg('Pick at least one role.');
      return;
    }
    const normalizedCode = instructorCode.trim().toUpperCase();
    if (roleInstructor && normalizedCode !== INSTRUCTOR_SECRET_CODE) {
      setMsg('Wrong instructor code.');
      return;
    }

    const { error } = await signUp(email, password, {
      is_student: roleStudent,
      is_instructor: roleInstructor,
      ...(roleInstructor ? { instructor_code: normalizedCode } : {}),
    });
    if (error) setMsg(error.message);
    else setMsg('Check email to confirm (or disable confirm in Supabase).');
  };

  const roleBtnClass = (active) =>
    `flex-1 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-xs transition-colors ${
      active
        ? 'border-primary/60 bg-primary/10 text-foreground'
        : 'border-border/40 bg-background text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div data-theme="light" className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-border/30 bg-card/60 p-6">
        <h1 className="font-display text-2xl text-center">Lunaria Cafe</h1>
        {/* A failed session check drops you here looking exactly like a normal
            logged-out visit. Say which it was, so nobody retypes a password
            that was never the problem. */}
        {authError && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700" style={FORM_FONT}>
            {authError}
          </p>
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          style={FORM_FONT}
          required
        />
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-border/40 bg-background px-3 py-2 pr-10 text-sm"
            style={FORM_FONT}
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>

        {isSignUp && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Sign up as</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRoleStudent(!roleStudent)}
                className={roleBtnClass(roleStudent)}
              >
                <GraduationCap className="h-3.5 w-3.5" />
                Student
              </button>
              <button
                type="button"
                onClick={() => setRoleInstructor(!roleInstructor)}
                className={roleBtnClass(roleInstructor)}
              >
                <BookOpen className="h-3.5 w-3.5" />
                Instructor
              </button>
            </div>

            {roleInstructor && (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Instructor secret code"
                  value={instructorCode}
                  onChange={(e) => setInstructorCode(e.target.value)}
                  className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
                  style={FORM_FONT}
                  required
                />
                <p className="text-[10px] text-muted-foreground/70">
                  Test version: the code is <span className="font-semibold text-foreground/80">{INSTRUCTOR_SECRET_CODE}</span> (not case-sensitive)
                </p>
              </div>
            )}

            <p className="text-[10px] text-amber-500/90">
              Only in the test version: one email can be "Instructor" and "Student" at the same time!
            </p>
          </div>
        )}

        {msg && <p className="text-sm text-amber-400">{msg}</p>}
        <Button type="submit" className="w-full">
          {isSignUp ? 'Create account' : 'Log in'}
        </Button>
        <button
          type="button"
          className="text-xs text-muted-foreground w-full"
          onClick={() => { setIsSignUp(!isSignUp); setMsg(''); }}
        >
          {isSignUp ? 'Already have an account? Log in' : 'New here? Sign up'}
        </button>

        <div className="flex items-center gap-3 pt-1">
          <div className="flex-1 h-px bg-border/30" />
          <span className="text-xs text-muted-foreground/40">or</span>
          <div className="flex-1 h-px bg-border/30" />
        </div>

        {!showGuestWarning ? (
  <button
    type="button"
    onClick={() => setShowGuestWarning(true)}
    className="flex items-center justify-center gap-2 text-xs text-muted-foreground/50 hover:text-muted-foreground w-full transition-colors"
  >
    <UserX className="w-3 h-3" />
    Play as Guest
  </button>
) : (
 <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
  <div className="flex items-center justify-center gap-2 text-xs text-amber-400">
    <AlertTriangle className="h-3.5 w-3.5" />
    <span>Progress won't be saved in guest mode.</span>
  </div>

  <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setShowGuestWarning(false)}
        className="flex-1 text-xs text-muted-foreground hover:text-foreground border border-border/30 rounded-md py-1.5 transition-colors"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={signInAsGuest}
        className="flex-1 text-xs text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-md py-1.5 transition-colors"
      >
        Continue
      </button>
    </div>
  </div>
)}
      </form>
    </div>
  );
}
