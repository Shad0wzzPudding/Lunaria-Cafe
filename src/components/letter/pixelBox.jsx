/**
 * The pixel-art frame the letters are drawn with.
 *
 * Extracted from LicenseEnvelope when friend requests grew their own letters:
 * the alternative was a second copy of the clip-path art, which would drift
 * from the original the first time either was touched.
 */

// Single-notch stepped corners — the pixel-art silhouette. Border is faked by
// nesting two clipped layers (clip-path cuts real CSS borders off).
export const PIXEL_CORNERS = (s) =>
  `polygon(0 ${s}, ${s} ${s}, ${s} 0, calc(100% - ${s}) 0, calc(100% - ${s}) ${s}, 100% ${s}, 100% calc(100% - ${s}), calc(100% - ${s}) calc(100% - ${s}), calc(100% - ${s}) 100%, ${s} 100%, ${s} calc(100% - ${s}), 0 calc(100% - ${s}))`;

export function PixelBox({
  size = '6px',
  border = '#7a5230',
  fill = '#e8cf9e',
  className = '',
  style = {},
  innerStyle = {},
  innerProps = {},
  children,
}) {
  return (
    <div className={className} style={{ clipPath: PIXEL_CORNERS(size), background: border, padding: '4px', ...style }}>
      {/* innerProps reaches the SCROLLING element — the privacy notice needs a
          scroll handler on exactly this div, not on the outer frame. */}
      <div style={{ clipPath: PIXEL_CORNERS(size), background: fill, width: '100%', height: '100%', ...innerStyle }} {...innerProps}>
        {children}
      </div>
    </div>
  );
}

export default PixelBox;
