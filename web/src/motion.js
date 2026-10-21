/*
 * Scroll-reveal for the whole app: any element matching REVEAL fades/slides in
 * the first time it enters the viewport, with a small stagger between siblings
 * that appear together. Elements are only hidden once JS has marked them, so
 * nothing stays invisible if this fails, and it is skipped for reduced motion.
 */
const REVEAL = [
  '.section',
  '.page-header',
  '.station-hero',
  '.hero',
  '.card',
  '.station-card',
  '.category-tile',
  '.decade-chip',
  '.year-btn',
  '.stat',
  '.track-row',
  '.mini-row',
  '.top-list li',
  '.bar-row',
  '.card-box',
  '.me-links > *',
  '.quiz-choice',
  '.report',
  '.empty',
  '.table tbody tr',
  '.on-air',
  '.car-station',
].join(',');

// On phones, long lists (song rows, tables) skip the reveal: animating hundreds of rows while
// scrolling is what makes a page feel heavy.
const HEAVY_ON_PHONES = new Set(['.track-row', '.mini-row', '.top-list li', '.bar-row', '.table tbody tr']);

export function startMotion() {
  if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const phone = window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 860;
  const REVEAL_NOW = phone ? REVEAL.split(',').filter((s) => !HEAVY_ON_PHONES.has(s)).join(',') : REVEAL;

  const io = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        const delay = Math.min(i, 14) * 45;
        el.style.setProperty('--rv-delay', `${delay}ms`);
        i += 1;
        el.classList.add('rv-in');
        io.unobserve(el);
        // Once revealed, drop the classes so hover effects use their normal timing.
        setTimeout(() => {
          el.classList.remove('rv', 'rv-in');
          el.style.removeProperty('--rv-delay');
        }, delay + 700);
      }
    },
    { threshold: 0.04, rootMargin: '0px 0px -4% 0px' },
  );

  const seen = new WeakSet();
  const track = (el) => {
    if (seen.has(el)) return;
    seen.add(el);
    el.classList.add('rv');
    io.observe(el);
  };
  const scan = (root) => {
    if (root.matches?.(REVEAL_NOW)) track(root);
    root.querySelectorAll?.(REVEAL_NOW).forEach(track);
  };

  const root = document.getElementById('root');
  scan(root);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) if (node.nodeType === 1) scan(node);
    }
  }).observe(root, { childList: true, subtree: true });
}
