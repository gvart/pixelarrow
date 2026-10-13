// Below-the-fold stills (class busts, clip posters) load only when they come within 600 px of the
// viewport. Native loading="lazy" is not enough here: Chromium's lazy distance (1250-2500 px) pulls
// every bust and poster in during the first view on a phone, where they compete with the hero image
// (measured: mobile Lighthouse LCP 1.8 s -> 2.9 s). Markup: <img data-src> (and <source data-srcset>
// inside a <picture>), with a <noscript> twin for visitors without JS. A [data-lazy-group] (the phone
// snap strip) loads all its images together, since cards clipped by the strip never intersect the
// viewport until swiped. Runs once per page on import.

const show = (img: HTMLImageElement) => {
  const pic = img.parentElement;
  if (pic instanceof HTMLPictureElement)
    for (const s of pic.querySelectorAll<HTMLSourceElement>('source[data-srcset]')) s.srcset = s.dataset.srcset ?? '';
  img.src = img.dataset.src ?? '';
  img.removeAttribute('data-src');
};

const groups = [...document.querySelectorAll<HTMLElement>('[data-lazy-group]')];
const loose = [...document.querySelectorAll<HTMLImageElement>('img[data-src]')].filter((i) => !i.closest('[data-lazy-group]'));
const reveal = (el: Element) =>
  el instanceof HTMLImageElement ? show(el) : el.querySelectorAll<HTMLImageElement>('img[data-src]').forEach(show);

if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries)
        if (e.isIntersecting) {
          io.unobserve(e.target);
          reveal(e.target);
        }
    },
    { rootMargin: '600px' },
  );
  for (const el of [...groups, ...loose]) io.observe(el);
} else [...groups, ...loose].forEach(reveal);
