import { PixelBox } from '@/components/letter/pixelBox';

/**
 * The closed envelope: kraft body, darker flap triangle, wax seal, address lines.
 *
 * Lifted out of LicenseEnvelope so friend letters wear the same paper as the
 * welcome letter. Only the addressing and the seal change between them — the
 * art itself must not, or the cafe ends up with two subtly different envelopes.
 *
 * Purely presentational: no button, no animation, no click target. Callers wrap
 * it in whatever they need (LicenseEnvelope makes it a button; the friend
 * letters fly it across the screen).
 */
export default function EnvelopeFace({
  to,
  from,
  seal = '🌙',
  sealColors = { border: '#4c3572', fill: '#7d5fde' },
  width = 'min(30rem, 86vw)',
}) {
  return (
    <PixelBox
      size="8px"
      style={{ width, aspectRatio: '30 / 19' }}
      innerStyle={{ position: 'relative', overflow: 'hidden' }}
    >
      {/* Bottom V fold lines of the envelope front */}
      <div className="absolute inset-0" aria-hidden="true">
        <div className="absolute left-0 bottom-0 w-1/2 h-full" style={{ background: '#dfc28c', clipPath: 'polygon(0 100%, 100% 100%, 0 18%)' }} />
        <div className="absolute right-0 bottom-0 w-1/2 h-full" style={{ background: '#dfc28c', clipPath: 'polygon(100% 100%, 0 100%, 100% 18%)' }} />
        {/* Top flap */}
        <div className="absolute left-0 top-0 w-full h-[58%]" style={{ background: '#caa365', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
        <div className="absolute left-0 top-0 w-full h-[58%]" style={{ background: '#b28950', clipPath: 'polygon(0 0, 100% 0, 50% 100%, 50% calc(100% - 6px), calc(100% - 8px) 4px, 8px 4px, 50% calc(100% - 6px), 50% 100%)' }} />
      </div>
      {/* Wax seal */}
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
        <PixelBox
          size="6px"
          border={sealColors.border}
          fill={sealColors.fill}
          style={{ width: '3.4rem', height: '3.4rem' }}
          innerStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className="text-xl select-none">{seal}</span>
        </PixelBox>
      </div>
      {/* Address lines */}
      <div className="absolute left-0 right-0 bottom-[8%] text-center space-y-0.5">
        <p className="font-pixel text-[11px] px-3 truncate" style={{ color: '#6b4a26' }}>{to}</p>
        <p className="font-pixel text-[10px] px-3 truncate" style={{ color: '#8a6a42' }}>{from}</p>
      </div>
    </PixelBox>
  );
}
