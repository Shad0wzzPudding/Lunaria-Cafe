import { getAIConfig, getStreamUrl } from '@/lib/aiIntegration';

export default function AttentionCamera() {
  const { useLiveAI } = getAIConfig();
  if (!useLiveAI) return null;

  const streamUrl = getStreamUrl();

  return (
    <aside className="absolute bottom-3 left-3 z-20 w-40 overflow-hidden rounded-lg border border-border/50 bg-black/60 shadow-lg">
      <p className="px-2 py-1 text-[10px] text-muted-foreground font-pixel">AI Camera</p>
      <img
        src={streamUrl}
        alt="Focus tracker camera"
        className="w-full aspect-video object-cover"
      />
    </aside>
  );
}
