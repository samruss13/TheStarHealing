/* The Star Healing: interactions */
(() => {
  const doc = document.documentElement;
  doc.classList.remove('no-js');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------------- page load ---------------- */
  requestAnimationFrame(() => document.body.classList.add('is-loaded'));
  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------- reveal on scroll ---------------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); revealIO.unobserve(e.target); }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('.reveal').forEach((el, i) => {
    // light stagger for siblings revealed together
    const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
    el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 5) * 80}ms`;
    revealIO.observe(el);
  });

  /* ---------------- header tone (light/dark sections) ---------------- */
  const header = $('.site-header');
  const toneIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) header.classList.toggle('is-light', e.target.dataset.tone === 'light');
    });
  }, { rootMargin: '0px 0px -94% 0px' });
  $$('main [data-tone], .footer').forEach((s) => toneIO.observe(s));

  /* ---------------- fullscreen menu ---------------- */
  const menu = $('#menu');
  const toggle = $('.menu-toggle');
  const setMenu = (open) => {
    toggle.setAttribute('aria-expanded', String(open));
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    menu.toggleAttribute('inert', !open);
    document.body.classList.toggle('menu-open', open);
    // keep screen readers and Tab inside the menu while it is open
    $$('main, .footer').forEach((el) => el.toggleAttribute('inert', open));
    if (open) setTimeout(() => $('a', menu).focus({ preventScroll: true }), 350);
  };
  toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    // keep Tab focus inside header + menu while open
    if (e.key === 'Tab' && menu.classList.contains('is-open')) {
      const focusables = [toggle, ...$$('a', menu)];
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // mark the current section in the menu (Gladeye-style italic active item)
  const navLinks = $$('[data-nav]');
  const navIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      navLinks.forEach((a) => a.setAttribute('aria-current', String(a.dataset.nav === e.target.id)));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((a) => { const s = document.getElementById(a.dataset.nav); if (s) navIO.observe(s); });

  /* ---------------- moon phase ---------------- */
  (function moon() {
    const SYNODIC = 29.530588853;
    const REF_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14);
    const age = ((((Date.now() - REF_NEW_MOON) / 864e5) % SYNODIC) + SYNODIC) % SYNODIC;
    const p = age / SYNODIC;                         // 0 = new, .5 = full
    const illum = (1 - Math.cos(2 * Math.PI * p)) / 2;
    const phases = [
      [1.85, 'New Moon', 'Set a quiet intention. Seeds planted in the dark grow strongest.'],
      [5.54, 'Waxing Crescent', 'Take one small, brave step toward what you are calling in.'],
      [9.23, 'First Quarter', 'Momentum time. Move your body and clear what blocks you.'],
      [12.92, 'Waxing Gibbous', 'Refine and nourish. Tend to yourself like a garden.'],
      [16.61, 'Full Moon', 'Release what feels heavy. A perfect night to charge your crystals.'],
      [20.30, 'Waning Gibbous', 'A season for gratitude. Share what you\'ve learned.'],
      [23.99, 'Last Quarter', 'Let go and declutter, both your space and your energy.'],
      [27.68, 'Waning Crescent', 'Rest, float, restore. Be a sea otter about it.'],
      [99, 'New Moon', 'Set a quiet intention. Seeds planted in the dark grow strongest.'],
    ];
    const [, name, tip] = phases.find(([max]) => age < max);
    $('[data-moon-name]').textContent = name;
    $('[data-moon-pct]').textContent = `· ${Math.round(illum * 100)}% lit`;
    $('[data-moon-tip]').textContent = tip;

    // draw lit portion
    const r = 46;
    const rx = Math.abs(Math.cos(2 * Math.PI * p)) * r;
    let d;
    if (p < 0.5) { // waxing, lit on the right
      const sweep = p < 0.25 ? 0 : 1;
      d = `M0 ${-r} A${r} ${r} 0 0 1 0 ${r} A${rx} ${r} 0 0 ${sweep} 0 ${-r}Z`;
    } else {       // waning, lit on the left
      const sweep = p < 0.75 ? 0 : 1;
      d = `M0 ${-r} A${r} ${r} 0 0 0 0 ${r} A${rx} ${r} 0 0 ${sweep} 0 ${-r}Z`;
    }
    $('.moon-lit').setAttribute('d', d);
  })();

  /* ---------------- hero sky: starfield + Scorpius ---------------- */
  (function sky() {
    const canvas = $('.hero__sky');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const hero = $('.hero');
    let w = 0, h = 0, dpr = 1, stars = [], cons = [], running = false, raf = 0;
    const start = performance.now();
    // power eases 0→1 while a pointer is over the sky, so highlights fade instead of popping
    const mouse = { x: -9999, y: -9999, nx: 0, ny: 0, tx: 0, ty: 0, inside: false, power: 0 };
    let starsW = 0;
    let shooting = null, nextShoot = start + 3000;

    // Scorpius (approximate, normalized). Index 3 = Antares.
    const S = [
      [0.78, 0.12], [0.80, 0.21], [0.83, 0.29], [0.71, 0.26], [0.66, 0.32], [0.62, 0.38],
      [0.585, 0.47], [0.56, 0.565], [0.53, 0.655], [0.475, 0.72], [0.405, 0.745],
      [0.335, 0.705], [0.30, 0.635], [0.27, 0.58], [0.245, 0.625],
    ];
    const ANTARES = 4;
    const LINKS = [[0, 1], [1, 2], [1, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11], [11, 12], [12, 13], [13, 14]];
    const names = { 4: 'Antares', 13: 'Shaula' };

    const palette = ['251,243,236', '251,243,236', '251,243,236', '240,179,156', '212,111,156'];

    function layout() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Only re-scatter the stars when the width changes (e.g. rotating the phone).
      // Mobile browsers fire resize when the address bar slides away during a swipe;
      // stars are stored as fractions of the sky so they simply stretch with it.
      if (stars.length && w === starsW) return layoutConstellation();
      starsW = w;
      const count = Math.min(900, Math.round((w * h) / 2400));
      stars = Array.from({ length: count }, () => {
        const z = Math.random() ** 2.2;
        return {
          fx: Math.random(), fy: Math.random(), z,
          r: 0.35 + z * 1.35,
          a: 0.25 + Math.random() * 0.6,
          tw: 0.6 + Math.random() * 2.2, ph: Math.random() * Math.PI * 2,
          c: palette[(Math.random() * palette.length) | 0],
        };
      });
      layoutConstellation();
    }

    function layoutConstellation() {
      // fit constellation: right side on desktop; on phones, in the gap
      // between the buttons and the moon card so the moon never covers it
      const wide = w > 900;
      const minX = 0.245, maxX = 0.83, minY = 0.12, maxY = 0.745;
      const ratio = (maxY - minY) / (maxX - minX);
      let boxW, boxH, ox, oy, dim = 1;
      if (wide) {
        boxW = Math.min(w * 0.4, (h * 0.66) / ratio);
        boxH = boxW * ratio;
        ox = w - boxW - w * 0.08;
        oy = (h - boxH) / 2 + h * 0.02;
      } else {
        // offsetTop ignores the reveal animation's transform, so this is the settled layout
        const content = $('.hero__content'), acts = $('.hero__actions'), moon = $('.moon-card');
        const top = content.offsetTop + acts.offsetTop + acts.offsetHeight + 24;
        const bottom = (moon ? moon.offsetTop : h) - 24;
        const maxH = w * 0.86 * ratio;
        if (bottom - top >= 96) {
          // room below the buttons: sit there, fully visible, toward the right
          boxH = Math.min(bottom - top, maxH);
          dim = 0.85;
          oy = top + (bottom - top - boxH) / 2;
          boxW = boxH / ratio;
          ox = w - boxW - Math.max(24, w * 0.1);
        } else {
          // very short screens: rise behind the text, dimmed, still ending above the moon card
          boxH = Math.min(bottom - h * 0.22, maxH);
          dim = 0.45;
          oy = bottom - boxH;
          boxW = boxH / ratio;
          ox = (w - boxW) / 2;
        }
      }
      cons = S.map(([x, y], i) => ({
        x: ox + ((x - minX) / (maxX - minX)) * boxW,
        y: oy + ((y - minY) / (maxY - minY)) * boxH,
        r: i === ANTARES ? 4.2 : i === 13 || i === 0 || i === 1 ? 2.8 : 2.1,
        i,
      }));
      cons.dim = dim;
    }

    function draw(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);

      // ease mouse parallax
      mouse.nx += (mouse.tx - mouse.nx) * 0.05;
      mouse.ny += (mouse.ty - mouse.ny) * 0.05;
      mouse.power += ((mouse.inside ? 1 : 0) - mouse.power) * (reduceMotion ? 1 : 0.12);
      const pw = mouse.power;

      // background stars
      for (const s of stars) {
        const px = s.fx * w + mouse.nx * s.z * 26;
        const py = s.fy * h + mouse.ny * s.z * 18;
        let a = s.a * (reduceMotion ? 1 : 0.55 + 0.45 * Math.sin(t * s.tw + s.ph));
        if (pw > 0.01) {
          const dx = px - mouse.x, dy = py - mouse.y, d2 = dx * dx + dy * dy;
          if (d2 < 120 * 120) {
            const k = (1 - Math.sqrt(d2) / 120) * pw;
            a = Math.min(1, a + k * 0.8);
            if (s.z > 0.12) {
              ctx.strokeStyle = `rgba(240,179,156,${k * 0.35})`;
              ctx.lineWidth = 0.6;
              ctx.beginPath(); ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(px, py); ctx.stroke();
            }
          }
        }
        ctx.fillStyle = `rgba(${s.c},${a})`;
        ctx.beginPath(); ctx.arc(px, py, s.r, 0, Math.PI * 2); ctx.fill();
      }

      // constellation
      const dim = cons.dim;
      const cx = mouse.nx * 10, cy = mouse.ny * 7;
      const prog = reduceMotion ? LINKS.length : Math.max(0, (t - 0.8) / 0.22);
      ctx.lineWidth = 1.1;
      LINKS.forEach(([a, b], k) => {
        const f = Math.max(0, Math.min(1, prog - k));
        if (!f) return;
        const A = cons[a], B = cons[b];
        ctx.strokeStyle = `rgba(240,179,156,${0.45 * dim})`;
        ctx.beginPath();
        ctx.moveTo(A.x + cx, A.y + cy);
        ctx.lineTo(A.x + cx + (B.x - A.x) * f, A.y + cy + (B.y - A.y) * f);
        ctx.stroke();
      });
      const appear = reduceMotion ? 1 : Math.min(1, t / 1.2);
      for (const c of cons) {
        const x = c.x + cx, y = c.y + cy;
        let glow = 0;
        if (pw > 0.01) {
          const d = Math.hypot(x - mouse.x, y - mouse.y);
          if (d < 160) glow = (1 - d / 160) * pw;
        }
        const pulse = reduceMotion ? 1 : 0.8 + 0.2 * Math.sin(t * 1.6 + c.i);
        const isA = c.i === ANTARES;
        const g = ctx.createRadialGradient(x, y, 0, x, y, c.r * (6 + glow * 6));
        g.addColorStop(0, isA ? `rgba(232,110,80,${0.8 * appear * dim})` : `rgba(251,237,226,${(0.55 + glow * 0.4) * appear * dim})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, c.r * (6 + glow * 6), 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = isA ? `rgba(255,170,140,${appear})` : `rgba(255,248,240,${appear * Math.max(dim, 0.7)})`;
        ctx.beginPath(); ctx.arc(x, y, c.r * pulse * (1 + glow * 0.4), 0, Math.PI * 2); ctx.fill();
        if (names[c.i] && dim === 1) {
          ctx.font = '500 11px "Instrument Sans", sans-serif';
          ctx.fillStyle = `rgba(251,243,236,${0.55 * appear})`;
          ctx.fillText(names[c.i].toUpperCase(), x + 12, y + 4);
        }
      }
      if (dim === 1) {
        const head = cons[0];
        ctx.font = 'italic 400 24px "Fraunces", Georgia, serif';
        ctx.fillStyle = `rgba(240,179,156,${0.8 * appear})`;
        ctx.textAlign = 'right';
        ctx.fillText('Scorpius', head.x + cx - 20, head.y + cy + 8);
        ctx.textAlign = 'left';
      }

      // occasional shooting star
      if (!reduceMotion) {
        if (!shooting && now > nextShoot) {
          shooting = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.35, vx: 9 + Math.random() * 5, vy: 3 + Math.random() * 2, life: 1 };
        }
        if (shooting) {
          const s = shooting;
          const grad = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 12, s.y - s.vy * 12);
          grad.addColorStop(0, `rgba(255,248,240,${s.life})`);
          grad.addColorStop(1, 'rgba(255,248,240,0)');
          ctx.strokeStyle = grad; ctx.lineWidth = 1.4;
          ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 12, s.y - s.vy * 12); ctx.stroke();
          s.x += s.vx; s.y += s.vy; s.life -= 0.018;
          if (s.life <= 0 || s.x > w + 100) { shooting = null; nextShoot = now + 4000 + Math.random() * 6000; }
        }
      }
    }

    function loop(now) { draw(now); raf = requestAnimationFrame(loop); }
    function play() { if (!running && !reduceMotion) { running = true; raf = requestAnimationFrame(loop); } }
    function pause() { running = false; cancelAnimationFrame(raf); }

    layout();
    if (reduceMotion) draw(performance.now() + 10000); else play();
    // web fonts change the headline height, so refit once they arrive
    if (document.fonts) document.fonts.ready.then(() => { layoutConstellation(); if (reduceMotion) draw(performance.now() + 10000); });

    let rt;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => { layout(); if (reduceMotion) draw(performance.now() + 10000); }, 120);
    });
    hero.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; mouse.inside = true;
      mouse.tx = (mouse.x / w - 0.5) * 2; mouse.ty = (mouse.y / h - 0.5) * 2;
      if (reduceMotion) draw(performance.now() + 10000);
    });
    // finger lifted, swipe turned into a scroll, or mouse left: fade out at the last spot
    const release = () => { mouse.inside = false; mouse.tx = 0; mouse.ty = 0; if (reduceMotion) draw(performance.now() + 10000); };
    hero.addEventListener('pointerleave', release);
    hero.addEventListener('pointercancel', release);
    hero.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') release(); });

    new IntersectionObserver(([e]) => (e.isIntersecting ? play() : pause())).observe(hero);
    document.addEventListener('visibilitychange', () => (document.hidden ? pause() : play()));
  })();

  /* ---------------- zodiac picker ---------------- */
  (function zodiac() {
    const SIGNS = [
      { n: 'Aries', g: '♈', d: 'Mar 21 – Apr 19', e: 'Fire', s: [3, 21], r: 'Sound Healing',
        t: 'All spark, all momentum. Your fire burns bright, but even a ram needs rest. Let vibration slow your pulse and quiet the inner race.' },
      { n: 'Taurus', g: '♉', d: 'Apr 20 – May 20', e: 'Earth', s: [4, 20], r: 'Makeup Artistry',
        t: 'Ruled by Venus, you love beauty you can feel. Treat yourself to a ritual of color and texture that celebrates exactly who you are.' },
      { n: 'Gemini', g: '♊', d: 'May 21 – Jun 20', e: 'Air', s: [5, 21], r: 'Sound Healing',
        t: 'Your mind has a hundred tabs open at once. Crystal bowls give your thoughts somewhere soft to land.' },
      { n: 'Cancer', g: '♋', d: 'Jun 21 – Jul 22', e: 'Water', s: [6, 21], r: 'Reiki',
        t: 'You hold space for everyone else. Let someone hold it for you this time. Reiki is a gentle way to refill your own cup.' },
      { n: 'Leo', g: '♌', d: 'Jul 23 – Aug 22', e: 'Fire', s: [7, 23], r: 'Makeup Artistry',
        t: 'Born for the spotlight. Whether it\'s a wedding, a shoot or a Tuesday, you deserve a look that matches your glow.' },
      { n: 'Virgo', g: '♍', d: 'Aug 23 – Sep 22', e: 'Earth', s: [8, 23], r: 'Reiki',
        t: 'The caretaker and the perfectionist. Your nervous system is asking you to stop fixing and simply receive.' },
      { n: 'Libra', g: '♎', d: 'Sep 23 – Oct 22', e: 'Air', s: [9, 23], r: 'Makeup Artistry',
        t: 'Harmony is your love language. A balanced, luminous look (and a little self-adoration) brings you back into alignment.' },
      { n: 'Scorpio', g: '♏', d: 'Oct 23 – Nov 21', e: 'Water', s: [10, 23], r: 'Reiki',
        t: 'Deep, magnetic and always transforming. Reiki meets you in the depths and helps you shed what you\'ve outgrown.' },
      { n: 'Sagittarius', g: '♐', d: 'Nov 22 – Dec 21', e: 'Fire', s: [11, 22], r: 'Sound Healing',
        t: 'The seeker. Let a seaside sound bath be your next adventure, one that travels inward.' },
      { n: 'Capricorn', g: '♑', d: 'Dec 22 – Jan 19', e: 'Earth', s: [12, 22], r: 'Reiki',
        t: 'You carry so much so well. Set the weight down for an hour and let energy work loosen what you\'ve been holding.' },
      { n: 'Aquarius', g: '♒', d: 'Jan 20 – Feb 18', e: 'Air', s: [1, 20], r: 'Sound Healing',
        t: 'Visionary and a little otherworldly. Frequency and vibration speak your language. Tune in and recalibrate.' },
      { n: 'Pisces', g: '♓', d: 'Feb 19 – Mar 20', e: 'Water', s: [2, 19], r: 'Sound Healing',
        t: 'Dreamy, intuitive and porous. Sound moves over you like the tide, clearing whatever you\'ve absorbed from everyone else.' },
    ];

    const wheel = $('.zodiac__wheel');
    const reading = $('.zodiac__reading');
    if (!wheel) return;

    // which sun sign season is it today?
    const now = new Date();
    const md = (now.getMonth() + 1) * 100 + now.getDate();
    const starts = SIGNS.map((s, i) => ({ i, v: s.s[0] * 100 + s.s[1] })).sort((a, b) => a.v - b.v);
    let seasonIdx = starts[starts.length - 1].i; // Capricorn wraps the new year
    starts.forEach(({ i, v }) => { if (md >= v) seasonIdx = i; });

    const center = document.createElement('div');
    center.className = 'zodiac__center';
    center.innerHTML = '<img src="assets/logo-320.jpg" alt="" width="160" height="160" loading="lazy">';
    wheel.appendChild(center);

    const buttons = SIGNS.map((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'zsign';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', s.n);
      b.innerHTML = `${s.g}︎`;
      const a = (i / 12) * Math.PI * 2;
      b.style.left = `${50 + 41 * Math.sin(a)}%`;
      b.style.top = `${50 - 41 * Math.cos(a)}%`;
      b.addEventListener('click', () => select(i, true));
      b.addEventListener('keydown', (e) => {
        const k = e.key;
        if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(k)) {
          e.preventDefault();
          const next = (i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : 11)) % 12;
          select(next, true); buttons[next].focus();
        }
      });
      wheel.appendChild(b);
      return b;
    });

    const f = (k) => $(`[data-z="${k}"]`, reading);
    function select(i, animate) {
      const s = SIGNS[i];
      buttons.forEach((b, j) => {
        b.setAttribute('aria-checked', String(i === j));
        b.tabIndex = i === j ? 0 : -1;
      });
      f('glyph').textContent = `${s.g}︎`;
      f('meta').textContent = `${s.d} · ${s.e}`;
      f('name').textContent = s.n;
      f('note').textContent = s.t;
      f('ritual').textContent = s.r;
      const madi = s.n === 'Scorpio';
      f('season').textContent = i === seasonIdx
        ? `✦ It's ${s.n} season right now${madi ? ' (Madi\'s sign, too)' : ''}`
        : (madi ? '✦ Madi\'s sign' : '');
      if (animate && !reduceMotion) {
        reading.classList.remove('is-swapping'); void reading.offsetWidth; reading.classList.add('is-swapping');
      }
    }
    select(seasonIdx, false);
  })();

  /* ---------------- butterflies ---------------- */
  (function butterflies() {
    const host = $('[data-butterflies]');
    if (!host) return;
    const n = Number(host.dataset.butterflies) || 4;
    const colors = [
      ['#E07A3E', '#2A1820'], // monarch
      ['#D46F9C', '#2A1820'], // rose
      ['#F0B39C', '#A9412B'], // peach
      ['#9FB98A', '#5A3A2E'], // malachite
      ['#C24E36', '#2A1820'], // rust
    ];
    const svg = (fill, stroke) => `
      <svg viewBox="0 0 64 48" aria-hidden="true">
        <g class="wing-l">
          <path d="M32 22 C27 6 9 -1 4 9 C0 18 16 24 32 24 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
          <path d="M32 25 C21 26 9 33 14 42 C19 48 30 37 32 27 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" opacity=".9"/>
          <circle cx="12" cy="11" r="2" fill="#FBF3EC"/>
        </g>
        <g class="wing-r">
          <path d="M32 22 C37 6 55 -1 60 9 C64 18 48 24 32 24 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6"/>
          <path d="M32 25 C43 26 55 33 50 42 C45 48 34 37 32 27 Z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" opacity=".9"/>
          <circle cx="52" cy="11" r="2" fill="#FBF3EC"/>
        </g>
        <ellipse cx="32" cy="25" rx="1.8" ry="10" fill="${stroke}"/>
        <path d="M31 16 Q28 8 25 6 M33 16 Q36 8 39 6" stroke="${stroke}" stroke-width="1.2" fill="none" stroke-linecap="round"/>
      </svg>`;

    const flies = Array.from({ length: n }, (_, i) => {
      const el = document.createElement('div');
      el.className = 'bfly';
      const [fill, stroke] = colors[i % colors.length];
      el.innerHTML = svg(fill, stroke);
      const scale = 0.6 + Math.random() * 0.7;
      el.querySelectorAll('.wing-l, .wing-r').forEach((g) => { g.style.animationDuration = `${0.22 + Math.random() * 0.2}s`; });
      host.appendChild(el);
      return {
        el, scale,
        x: Math.random(), y: 0.1 + Math.random() * 0.8,
        vx: (0.012 + Math.random() * 0.02) * (Math.random() < 0.5 ? -1 : 1),
        ph: Math.random() * Math.PI * 2, amp: 0.03 + Math.random() * 0.05,
      };
    });

    let W = host.clientWidth, H = host.clientHeight;
    new ResizeObserver(() => { W = host.clientWidth; H = host.clientHeight; }).observe(host);
    const place = (f, t) => {
      const y = f.y + Math.sin(t * 0.9 + f.ph) * f.amp;
      const tilt = Math.sin(t * 1.3 + f.ph) * 14 + (f.vx > 0 ? 10 : -10);
      f.el.style.transform = `translate(${f.x * W}px, ${y * H}px) rotate(${tilt}deg) scale(${f.scale})`;
    };

    if (reduceMotion) { flies.forEach((f) => { place(f, 0); f.el.querySelectorAll('g').forEach((g) => (g.style.animation = 'none')); }); return; }

    let raf = 0, last = performance.now(), on = false;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const t = now / 1000;
      flies.forEach((f) => {
        f.x += f.vx * dt * 2;
        if (f.x > 1.05) f.x = -0.05;
        if (f.x < -0.05) f.x = 1.05;
        place(f, t);
      });
      raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !on) { on = true; last = performance.now(); raf = requestAnimationFrame(tick); }
      else if (!e.isIntersecting && on) { on = false; cancelAnimationFrame(raf); }
    }).observe(host);
  })();

  /* ---------------- seamless marquee ---------------- */
  (function marquee() {
    const track = $('.marquee__track');
    if (!track || reduceMotion) return;
    const strip = $('.marquee');
    const btn = $('.marquee-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const paused = btn.getAttribute('aria-pressed') !== 'true';
        btn.setAttribute('aria-pressed', String(paused));
        strip.classList.toggle('is-paused', paused);
        $('.marquee-toggle__label', btn).textContent = paused ? 'Play gallery' : 'Pause gallery';
      });
    }
    [...track.children].forEach((node) => {
      const clone = node.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('img').forEach((img) => (img.alt = ''));
      track.appendChild(clone);
    });
  })();
})();
