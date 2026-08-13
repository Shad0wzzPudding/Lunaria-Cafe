import { Search, X } from 'lucide-react';

/**
 * Shared filter box for the four list surfaces (classroom directory,
 * instructor's rooms, roster, session history).
 *
 * There is no Input primitive in this project — a raw styled <input> is
 * the house style (see InstructorRoundControl). This wraps that style
 * once with the icon and clear button rather than repeating it four
 * times with four slightly different paddings.
 */
export default function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-border/40 bg-background py-1.5 pl-8 pr-8 text-xs text-foreground placeholder:text-muted-foreground/70 focus:border-primary/50 focus:outline-none"
        style={{ fontFamily: "'Inter Variable', sans-serif" }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
