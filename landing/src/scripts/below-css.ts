// The stylesheet of the sections below the fold (styles/below.css: clips, FAQ, closing). It is kept out
// of the inline CSS because the HTML must fit the first round trip (inline, mobile LCP crossed 2.0 s),
// and it is fetched only when the clips section comes within 1500 px, or at once when the page opens
// on an anchor (a #faq deep link). Measured (V6-LAND-05): any early request for it, even one sent on
// the load event, adds about 75 ms to mobile LCP on a slow phone. 1500 px is several screens of
// scrolling, so the styles are in place before the sections are seen. Without JS a <noscript> link in
// Clips.astro stands in.
import href from '../styles/below.css?url';

export function loadBelowCss(): void {
  const clips = document.getElementById('clips');
  if (!clips) return;
  const load = () => document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
  if (location.hash) return load();
  const near = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      near.disconnect();
      load();
    },
    { rootMargin: '1500px 0px' },
  );
  near.observe(clips);
}
