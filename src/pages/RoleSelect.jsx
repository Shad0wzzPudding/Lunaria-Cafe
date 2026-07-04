import { useAuth } from '@/auth/useAuth';
import { GraduationCap, BookOpen } from 'lucide-react';

// Shown after login when an account holds both roles (prototype allows it).
export default function RoleSelect() {
  const { user, chooseRole, signOut } = useAuth();

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="space-y-1">
          <h1 className="font-display text-2xl">Welcome back!</h1>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <p className="text-sm text-muted-foreground">How do you want to enter today?</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => chooseRole('student')}
            className="group rounded-xl border border-border/40 bg-card/60 p-6 space-y-3 hover:border-primary/60 hover:bg-primary/10 transition-colors"
          >
            <GraduationCap className="h-8 w-8 mx-auto text-muted-foreground group-hover:text-foreground transition-colors" />
            <div className="font-display">Student</div>
            <p className="text-[10px] text-muted-foreground">Run your cafe and focus</p>
          </button>

          <button
            type="button"
            onClick={() => chooseRole('instructor')}
            className="group rounded-xl border border-border/40 bg-card/60 p-6 space-y-3 hover:border-primary/60 hover:bg-primary/10 transition-colors"
          >
            <BookOpen className="h-8 w-8 mx-auto text-muted-foreground group-hover:text-foreground transition-colors" />
            <div className="font-display">Instructor</div>
            <p className="text-[10px] text-muted-foreground">Manage classrooms and stats</p>
          </button>
        </div>

        <button
          type="button"
          onClick={signOut}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
