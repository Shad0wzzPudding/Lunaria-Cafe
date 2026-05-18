export default function CafeLayout({ header, sidebar, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-white">
      {header && <header className="border-b border-white/10 px-6 py-4">{header}</header>}
      <div className="flex flex-1">
        {sidebar && (
          <aside className="w-64 shrink-0 border-r border-white/10 p-4">{sidebar}</aside>
        )}
        <main className="flex-1 p-6">{children}</main>
      </div>
      {footer && <footer className="border-t border-white/10 px-6 py-3">{footer}</footer>}
    </div>
  );
}
