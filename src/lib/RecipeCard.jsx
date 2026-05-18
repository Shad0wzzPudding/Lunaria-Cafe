export default function RecipeCard({ name, ingredients = [], prepTime, unlocked = true }) {
  return (
    <article
      className={`rounded-lg border p-4 ${
        unlocked ? 'border-white/10 bg-white/5' : 'border-white/5 bg-white/[0.02] opacity-50'
      }`}
    >
      <h3 className="font-medium">{name}</h3>
      <p className="mt-1 text-xs text-white/50">{prepTime} min prep</p>
      <ul className="mt-3 space-y-1 text-sm text-white/70">
        {ingredients.map((ingredient) => (
          <li key={ingredient}>• {ingredient}</li>
        ))}
      </ul>
    </article>
  );
}
