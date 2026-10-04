import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Height an element keeps covering at the top of the viewport while the page
 * scrolls: its rendered height when it is `position: sticky` or `fixed`,
 * otherwise 0 (it scrolls away). Sticky elements below it use the value as
 * their `top` so they stack instead of overlapping or leaving a gap.
 *
 * Re-measures when the element resizes (wrapped content) and on window
 * resize (media queries switch `position`). Returns null until measured.
 */
export function useStuckHeight(
  ref: RefObject<HTMLElement | null>
): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const { position } = getComputedStyle(el);
      const next =
        position === 'sticky' || position === 'fixed'
          ? el.getBoundingClientRect().height
          : 0;
      setHeight((prev) => (prev === next ? prev : next));
    };

    measure();
    window.addEventListener('resize', measure);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(measure)
        : null;
    observer?.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [ref]);

  return height;
}
