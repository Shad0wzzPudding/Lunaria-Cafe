import { useAuth } from '@/auth/AuthProvider';
import { Button } from '@/components/ui/button';
import { BookOpen, GraduationCap, LogOut } from 'lucide-react';

// Instructor-only shell. Instructors never mount the game
// (GameProvider) — this page is their whole experience.
export default function InstructorDashboard() {
  const { user, profile, chooseRole, signOut } = useAuth();

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      <header className="border-b border-border/30 bg-card/40">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-display text-lg leading-tight">Instructor Dashboard</h1>
              <p className="text-[10px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {profile?.is_student && (
              <Button variant="outline" size="sm" onClick={() => chooseRole('student')}>
                <GraduationCap className="h-3.5 w-3.5 mr-1" />
                Switch to Student
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-xl border border-dashed border-border/40 p-10 text-center text-sm text-muted-foreground">
          Classroom management is coming next — create rooms, invite students, and view their stats here.
        </div>
      </main>
    </div>
  );
}
