// Gameplay clips behind the hero and the chapter bands (markup: components/Clip.astro).
// - The source is set only when a clip comes near the viewport; wide screens take the -hd files.
// - Muted and inline, so there is never sound; a clip plays while at least a quarter of it is in view.
// - Reduced motion, data saver or a 2g connection: the poster stays until the visitor presses Play,
//   and a switch to reduced motion pauses everything at once.
// - Every clip has a Play / Pause button (WCAG 2.2.2); the visitor's press wins over autoplay.
// - If no source can be played, the poster stays and the button goes.

type Conn = { saveData?: boolean; effectiveType?: string };
type Clip = { el: HTMLElement; video: HTMLVideoElement; btn: HTMLButtonElement; seen: boolean; loaded: boolean; user: 'play' | 'pause' | null };

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const wide = matchMedia('(min-width: 1280px)');

function manualOnly(): boolean {
  const conn = (navigator as Navigator & { connection?: Conn }).connection;
  return reduce.matches || !!conn?.saveData || /2g$/.test(conn?.effectiveType ?? '');
}

const TYPE: Record<string, string> = { webm: 'video/webm', mp4: 'video/mp4' };

export function initClips(root: ParentNode = document): void {
  const clips: Clip[] = [];

  const load = (c: Clip) => {
    if (c.loaded) return;
    c.loaded = true;
    const hd = wide.matches ? (c.el.dataset.hd ?? '') : '';
    const urls = `${hd} ${c.el.dataset.sources ?? ''}`.split(' ').filter(Boolean);
    for (const url of urls) {
      const s = document.createElement('source');
      s.src = url;
      s.type = TYPE[url.split('.').pop() ?? ''] ?? '';
      c.video.append(s);
    }
    // The last source failing means none can play: keep the poster.
    c.video.lastElementChild?.addEventListener('error', () => {
      c.btn.hidden = true;
      c.el.classList.remove('is-playing', 'is-shown');
    });
    c.video.preload = 'auto';
    c.video.load();
  };
  const update = (c: Clip) => {
    const want = c.seen && c.user !== 'pause' && (c.user === 'play' || !manualOnly());
    if (want) {
      load(c);
      if (c.video.paused) c.video.play().catch(() => {});
    } else if (!c.video.paused) c.video.pause();
  };

  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = clips.find((x) => x.el === e.target);
        if (c && e.isIntersecting && !manualOnly()) {
          load(c);
          near.unobserve(c.el);
        }
      }
    },
    { rootMargin: '400px 0px' },
  );
  const inView = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = clips.find((x) => x.el === e.target);
        if (!c) continue;
        c.seen = e.isIntersecting;
        if (!c.seen && c.user === 'play') c.user = null; // out of view: autoplay rules again next time
        update(c);
      }
    },
    { threshold: 0.25 },
  );

  for (const el of root.querySelectorAll<HTMLElement>('[data-clip]')) {
    const video = el.querySelector('video');
    const btn = el.querySelector<HTMLButtonElement>('.clip__toggle');
    if (!video || !btn) continue;
    const c: Clip = { el, video, btn, seen: false, loaded: false, user: null };
    clips.push(c);
    const label = el.dataset.label ?? 'clip';
    const sync = (playing: boolean) => {
      el.classList.toggle('is-playing', playing);
      if (playing) el.classList.add('is-shown'); // a paused clip keeps its frame, not the poster
      btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} clip: ${label}`);
    };
    video.addEventListener('playing', () => sync(true));
    video.addEventListener('pause', () => sync(false));
    btn.addEventListener('click', () => {
      c.user = video.paused ? 'play' : 'pause';
      update(c);
    });
    btn.hidden = false;
    near.observe(el);
    inView.observe(el);
  }

  reduce.addEventListener('change', () => {
    for (const c of clips) {
      if (reduce.matches) c.user = null;
      update(c);
    }
  });
}
