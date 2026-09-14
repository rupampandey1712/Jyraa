'use client';

type BrandMarkProps = {
  showWordmark?: boolean;
  compact?: boolean;
  className?: string;
};

/**
 * The product mark: a flat accent-filled tile with the glyph knocked out, sized
 * like an Azure DevOps organisation icon rather than a gradient app badge.
 */
export function BrandMark({
  showWordmark = true,
  compact = false,
  className = '',
}: BrandMarkProps) {
  const size = compact ? 'h-6 w-6' : 'h-8 w-8';

  return (
    <div className={`flex items-center ${compact ? 'gap-2' : 'gap-3'} ${className}`}>
      <div
        className={`flex ${size} shrink-0 items-center justify-center rounded-sm`}
        style={{ background: 'var(--accent)' }}
      >
        <svg
          viewBox="0 0 48 48"
          aria-hidden="true"
          className={compact ? 'h-4 w-4 text-white' : 'h-5 w-5 text-white'}
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 12H36L20 28H32L16 40"
            stroke="currentColor"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {showWordmark ? (
        <p
          className={`font-semibold ${compact ? 'text-[15px]' : 'text-base'}`}
          style={{ color: 'var(--text-primary)' }}
        >
          ZYRAA
        </p>
      ) : null}
    </div>
  );
}
