import { useEffect, useState } from 'react';
import { initials } from './icons';

/**
 * Platform block icons are theme SVGs under `/ui-themes/...`. They are served
 * same-origin so they load normally, but deleted or renamed icons are common in
 * older workflows — fall back to initials rather than a broken-image glyph.
 */
export default function BlockIcon({
  iconPath,
  label,
  fallback,
  className,
}: {
  iconPath?: string;
  label?: string;
  fallback?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconPath]);

  if (iconPath && !broken) {
    return <img className={className} src={iconPath} alt="" loading="lazy" onError={() => setBroken(true)} />;
  }
  return <em className={className}>{initials(label, fallback)}</em>;
}
