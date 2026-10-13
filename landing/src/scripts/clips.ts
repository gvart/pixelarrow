// Gameplay clips: play when visible, pause when not (ADR-0011 Decision 3 and the fallback table).
// - The source is set only when a clip comes near the viewport (desktop) or is half in view (phones).
// - Autoplay is muted and inline; at most one clip plays on phones, two on desktop (the most visible).
// - Reduced motion, data saver or a 2g connection: posters only, a clip plays only when pressed.
// - Every clip has a Play/Pause button, so autoplay can always be stopped (WCAG 2.2.2).
// Markup: Clip.astro. Used by Modes (M1-M4) and Clips (G1-G4).

type Conn = { saveData?: boolean; effectiveType?: string };
type Clip = {
  el: HTMLElement;
  video: HTMLVideoElement;
  btn: HTMLButtonElement;
  ratio: number;
  loaded: boolean;
  /** The visitor's last press while this clip was in view: it wins over autoplay. */
  user: 'play' | 'pause' | null;
};

const PHONE = '(max-width: 767px)';

export function manualOnly(): boolean {
  const conn = (navigator as Navigator & { connection?: Conn }).connection;
  return (
    matchMedia('(prefers-reduced-motion: reduce)').matches || !!conn?.saveData || /2g$/.test(conn?.effectiveType ?? '')
  );
}

export function initClips(root: ParentNode = document): void {
  const phone = matchMedia(PHONE);
  const manual = manualOnly();
  const clips: Clip[] = [];

  const load = (c: Clip) => {
    if (c.loaded) return;
    c.loaded = true;
    for (const [type, key] of [['video/webm', 'webm'], ['video/mp4', 'mp4']] as const) {
      const s = document.createElement('source');
      s.type = type;
      s.src = c.el.dataset[key] ?? '';
      c.video.append(s);
    }
    c.video.preload = 'auto';
    c.video.load();
  };
  const play = (c: Clip) => {
    load(c);
    if (c.video.paused) c.video.play().catch(() => {});
  };
  const pause = (c: Clip) => {
    if (!c.video.paused) c.video.pause();
  };

  // Which clips should be playing now: the visitor's own picks first, then the most visible ones.
  const update = () => {
    const limit = phone.matches ? 1 : 2;
    const wanted = clips
      .filter((c) => c.ratio >= 0.5 && c.user !== 'pause' && (!manual || c.user === 'play'))
      .sort((a, b) => Number(b.user === 'play') - Number(a.user === 'play') || b.ratio - a.ratio)
      .slice(0, limit);
    for (const c of clips) (wanted.includes(c) ? play : pause)(c);
  };

  const seen = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = clips.find((x) => x.el === e.target);
        if (!c) continue;
        c.ratio = e.isIntersecting ? e.intersectionRatio : 0;
        if (c.ratio === 0) c.user = null; // out of view: autoplay rules again next time
      }
      update();
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );
  // Desktop fetches a little ahead so the clip is ready when it arrives; phones wait for 50% in view.
  const near = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const c = clips.find((x) => x.el === e.target);
        if (c && e.isIntersecting && !manual && !phone.matches) {
          load(c);
          near.unobserve(c.el);
        }
      }
    },
    { rootMargin: '300px 0px' },
  );

  for (const el of root.querySelectorAll<HTMLElement>('[data-clip]')) {
    const video = el.querySelector('video');
    const btn = el.querySelector<HTMLButtonElement>('.clip__toggle');
    if (!video || !btn) continue;
    const c: Clip = { el, video, btn, ratio: 0, loaded: false, user: null };
    clips.push(c);
    const label = el.dataset.label ?? 'clip';
    const sync = (playing: boolean) => {
      el.classList.toggle('is-playing', playing);
      if (playing) el.classList.add('is-shown'); // a paused clip keeps its frame, not the poster
      btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'}: ${label}`);
    };
    video.addEventListener('playing', () => sync(true));
    video.addEventListener('pause', () => sync(false));
    btn.addEventListener('click', () => {
      c.user = video.paused ? 'play' : 'pause';
      if (c.user === 'play') c.ratio = Math.max(c.ratio, 0.5); // pressed, so it counts as in view
      update();
    });
    btn.hidden = false;
    seen.observe(el);
    near.observe(el);
  }
}
