import { useEffect, useRef, useState, useId } from 'react';

// Count-up that only starts once the card is on screen, and does nothing at all
// when the visitor has asked for reduced motion.
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    const reduced = typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!node || reduced || !('IntersectionObserver' in window)) {
      setValue(target);
      return undefined;
    }
    let frame;
    let started = false;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        observer.disconnect();
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min((now - t0) / duration, 1);
          setValue(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) frame = requestAnimationFrame(tick);
          else setValue(target);
        };
        frame = requestAnimationFrame(tick);
      });
    }, { threshold: 0.25 });
    observer.observe(node);
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [target, duration]);

  return [value, ref];
}

function DotArrow() {
  const dots = [
    [14, 14, '0.54s'], [38, 14, '0.36s'], [62, 14, '0.18s'], [86, 14, '0s'],
    [38, 38, '0.54s'], [62, 38, '0.36s'], [86, 38, '0.18s'],
    [62, 62, '0.54s'], [86, 62, '0.36s'],
    [86, 86, '0.54s'],
  ];
  return (
    <svg
      className="h-12 w-12 shrink-0 sm:h-16 sm:w-16"
      aria-hidden="true"
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      style={{ fill: 'rgb(249 115 22)' }}
    >
      {dots.map(([cx, cy, delay]) => (
        <circle key={`${cx}-${cy}`} className="credit-dot" style={{ '--credit-d': delay }} cx={cx} cy={cy} r="9" />
      ))}
    </svg>
  );
}

/**
 * One integration-credit metric. Adapted from the library's "Stat Card":
 * soft tinted card, descending dot-grid accent, count-up figure and two
 * label/value pairs, restyled to MealDrop's tokens and orange brand accent.
 */
export default function CreditStatCard({
  title,
  value,
  prefix = '',
  suffix = '',
  decimals = 0,
  details = [],
  note,
}) {
  const grainId = useId().replace(/:/g, '');
  const [shown, ref] = useCountUp(Number(value) || 0);
  const display = shown.toLocaleString('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <div
      ref={ref}
      className="relative flex flex-col justify-between gap-8 overflow-hidden rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(125% 125% at 100% 0%, rgba(249,115,22,0.20) 0%, rgba(249,115,22,0.08) 32%, rgba(249,115,22,0) 64%)',
        }}
      />
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-40 mix-blend-overlay"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          WebkitMaskImage: 'radial-gradient(125% 125% at 100% 0%, black 0%, black 22%, transparent 72%)',
          maskImage: 'radial-gradient(125% 125% at 100% 0%, black 0%, black 22%, transparent 72%)',
        }}
      >
        <filter id={`grain-${grainId}`}>
          <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#grain-${grainId})`} />
      </svg>

      <div className="relative flex items-start justify-between gap-4">
        <h3 className="text-base font-semibold leading-tight text-gray-900">{title}</h3>
        <DotArrow />
      </div>

      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <p className="text-4xl font-bold tracking-tight text-gray-900 tabular-nums sm:text-5xl">
          {prefix}{display}{suffix}
        </p>
        {details.length > 0 && (
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {details.map((d) => (
              <div key={d.label}>
                <dt className="text-sm text-gray-600">{d.label}</dt>
                <dd className="text-sm font-medium text-gray-900">{d.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {note && <p className="relative text-xs leading-relaxed text-gray-600">{note}</p>}
    </div>
  );
}