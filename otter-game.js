/* Ollie's Morro Bay: a tiny top-down sea otter game for The Star Healing.
   Original map and art, drawn in code. North is up. */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const W = 2000, H = 1400;           // world size
  const M = 600;                      // painted margin around the world, seen in the distance
  const TILT = 40 * Math.PI / 180;    // diorama camera tilt
  const COS_T = Math.cos(TILT), SIN_T = Math.sin(TILT);
  const ROCK_H = 210, STACK_H = 250;  // heights of upright landmarks (world px)
  const STACKS = [[1500, 330], [1536, 322], [1572, 314]];
  const MASK_SCALE = 0.25;            // collision mask resolution
  const START = { x: 1180, y: 820 };

  /* ---------------- map shapes ---------------- */
  // mainland (east + north shore). Corners sit outside the world so smoothing never opens water there.
  const MAINLAND = [[740, -800], [2800, -800], [2800, 2200], [1640, 2200], [1560, 1600], [1500, 1260], [1450, 1110], [1430, 960],
    [1390, 830], [1360, 700], [1345, 560], [1320, 430], [1250, 320], [1150, 250], [1010, 215], [880, 190], [800, 130]];
  const CAUSEWAY = [[670, 200], [790, 112], [840, 165], [712, 245]];
  const ROCK = { x: 630, y: 270, r: 105 };
  const SPIT = [[730, 480], [790, 470], [840, 640], [900, 880], [960, 1120], [1010, 1600], [1060, 2200], [900, 2200], [880, 1600], [850, 1150], [800, 900], [750, 660]];
  const MARSH = [{ x: 1300, y: 1200, r: 60 }, { x: 1385, y: 1300, r: 75 }, { x: 1230, y: 1335, r: 45 }];
  const KELP = [{ x: 300, y: 900, r: 150 }, { x: 390, y: 1185, r: 100 }, { x: 175, y: 600, r: 85 }];
  const RAFT = { x: 1000, y: 600 };

  // the beach on the harbor's north shore, where Madi and a family hang out
  const BEACH = { x: 940, y: 168, rx: 125, ry: 36 };
  const PEOPLE = [
    { id: 'dad', x: 866, y: 180, h: 46, hair: '#2b211c', style: 'short', shirt: '#4f7896', pants: '#3a3a44', skin: '#e2b896' },
    { id: 'mom', x: 897, y: 184, h: 42, hair: '#ecd38a', style: 'long', shirt: '#1e1a1f', pants: '#1e1a1f', skin: '#f0cdb0' },
    // the daughter is Madi's age, so same height
    { id: 'girl', x: 929, y: 188, h: 42, hair: '#2b211c', style: 'long', shirt: '#fbf8f3', pants: '#fbf8f3', skin: '#ebc4a3' },
    { id: 'madi', x: 976, y: 190, h: 42, hair: '#8e2a3a', style: 'madi', shirt: '#e07aa6', pants: '#f4ece4', skin: '#f2d2bd' },
  ];
  const MADI = PEOPLE[3];
  const TALK_ZONE = { x: 950, y: 235, r: 210 };

  const STARS = [[470, 250], [300, 760], [560, 1300], [990, 390], [1220, 690], [1110, 930], [1330, 1070]];

  const PLACES = [
    { id: 'rock', name: 'Morro Rock', x: 630, y: 270, r: 200,
      fact: 'A volcanic plug about 23 million years old, the westernmost of the "Nine Sisters" peaks. It\'s a protected home for nesting peregrine falcons.' },
    { id: 'harbor', name: 'The Harbor & T-Pier', x: 1095, y: 340, r: 110,
      fact: 'Calm harbor water near the T-pier is a favorite otter nap spot, with plenty of crabs and clams nearby.' },
    { id: 'sealions', name: 'Sea Lion Dock', x: 1262, y: 500, r: 105,
      fact: 'California sea lions haul out on the floating docks to sunbathe. They are very, very loud about it.' },
    { id: 'embarcadero', name: 'The Embarcadero', x: 1300, y: 790, r: 110,
      fact: 'Morro Bay\'s waterfront. Otters float right off the docks, cracking shellfish on their bellies with a favorite rock.' },
    { id: 'kelp', name: 'Kelp Forest', x: 300, y: 900, r: 170,
      fact: 'Otters wrap themselves in kelp so they don\'t drift away while they nap. Swimming is slower in here, so take your time.' },
    { id: 'spit', name: 'The Sand Spit', x: 880, y: 1000, r: 140,
      fact: 'A long ribbon of dunes that shelters the bay from Pacific swells. The ocean side is wild; the bay side is calm.' },
    { id: 'estuary', name: 'The Estuary', x: 1290, y: 1240, r: 165,
      fact: 'Morro Bay is a protected estuary where fresh water meets the sea, a nursery for fish, shorebirds and eelgrass.' },
  ];

  const FINALE = {
    name: 'You found your raft!',
    fact: 'Sea otters often hold paws while they rest so they don\'t drift apart. A group of resting otters is called a raft. Rest is how we float.',
  };

  /* ---------------- helpers ---------------- */
  function rng(seed) { // mulberry32
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function smoothPath(pts) {
    const p = new Path2D();
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const n = pts.length;
    const m0 = mid(pts[n - 1], pts[0]);
    p.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
      const c = pts[i], m = mid(c, pts[(i + 1) % n]);
      p.quadraticCurveTo(c[0], c[1], m[0], m[1]);
    }
    p.closePath();
    return p;
  }
  const circlePath = ({ x, y, r }) => { const p = new Path2D(); p.arc(x, y, r, 0, Math.PI * 2); return p; };
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  const paths = {
    mainland: smoothPath(MAINLAND),
    causeway: smoothPath(CAUSEWAY),
    rock: circlePath(ROCK),
    spit: smoothPath(SPIT),
    marsh: MARSH.map(circlePath),
  };

  function sparkle(ctx, x, y, r) { // four-point star like the logo's sparkles
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.closePath();
  }

  /* ---------------- world render (static layer) ---------------- */
  let world = null; // { canvas, mask, mw, mh, mini }

  function buildWorld() {
    if (world) return world;
    const c = document.createElement('canvas');
    c.width = W + 2 * M; c.height = H + 2 * M;
    const g = c.getContext('2d');
    g.translate(M, M);
    const rand = rng(1771);

    // ocean: deep to the west, lighter toward the bay
    const ocean = g.createLinearGradient(-M, 0, W + M, 0);
    ocean.addColorStop(0, '#123a55'); ocean.addColorStop(0.42, '#1d5672'); ocean.addColorStop(1, '#2a6c84');
    g.fillStyle = ocean; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    // calmer, shallower bay water
    g.fillStyle = 'rgba(92,165,178,.35)';
    g.fill(smoothPath([[740, 400], [1300, 200], [1520, 1450], [880, 1450]]));
    // depth mottling
    for (let i = 0; i < 280; i++) {
      const x = -M + rand() * (W + 2 * M), y = -M + rand() * (H + 2 * M), r = 30 + rand() * 120;
      g.fillStyle = rand() < 0.5 ? 'rgba(8,30,48,.07)' : 'rgba(140,200,210,.05)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, rand() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    // kelp forests
    KELP.forEach((k) => {
      for (let i = 0; i < k.r * 1.1; i++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * k.r;
        const x = k.x + Math.cos(a) * d, y = k.y + Math.sin(a) * d;
        g.fillStyle = `rgba(${90 + rand() * 40 | 0},${95 + rand() * 30 | 0},${40 + rand() * 20 | 0},${0.35 + rand() * 0.35})`;
        g.beginPath(); g.ellipse(x, y, 4 + rand() * 7, 2 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2); g.fill();
      }
    });

    // land: foam halo, beach band, then fill
    const lands = [paths.mainland, paths.causeway, paths.spit, ...paths.marsh];
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(240,250,250,.35)'; g.lineWidth = 30; lands.forEach((p) => g.stroke(p)); g.stroke(paths.rock);
    g.strokeStyle = 'rgba(240,250,250,.5)'; g.lineWidth = 16; lands.forEach((p) => g.stroke(p)); g.stroke(paths.rock);
    g.strokeStyle = '#e6d2ae'; g.lineWidth = 12; [paths.mainland, paths.causeway].forEach((p) => g.stroke(p));

    // raised land: a darker band under the south-facing shores reads as cliff height once tilted
    const cliff = (path, dy, color) => { g.save(); g.translate(0, dy); g.fillStyle = color; g.fill(path); g.restore(); };
    cliff(paths.mainland, 16, '#55502f');
    cliff(paths.causeway, 6, '#b89f76'); cliff(paths.spit, 7, '#b89f76');
    paths.marsh.forEach((path) => cliff(path, 5, '#4a6337'));
    g.fillStyle = '#87975f'; g.fill(paths.mainland);
    // hills and scrub on the mainland
    g.save(); g.clip(paths.mainland);
    for (let i = 0; i < 320; i++) {
      const x = 1350 + rand() * 1500, y = -M + rand() * (H + 2 * M), r = 20 + rand() * 70;
      g.fillStyle = rand() < 0.55 ? 'rgba(60,78,40,.16)' : 'rgba(200,190,130,.12)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.7, rand() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 170; i++) { // north shore too
      const x = 760 + rand() * 900, y = -M + rand() * (220 + M), r = 14 + rand() * 40;
      g.fillStyle = 'rgba(60,78,40,.14)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, rand() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    // Embarcadero: waterfront road + little buildings
    g.strokeStyle = 'rgba(70,60,55,.55)'; g.lineWidth = 9;
    g.beginPath(); g.moveTo(1300, 280); g.quadraticCurveTo(1420, 460, 1440, 640); g.quadraticCurveTo(1460, 820, 1520, 1000); g.stroke();
    const roofs = ['#d9a089', '#c97a64', '#efe0cf', '#b9806e', '#e8c3a8', '#a96a5a'];
    for (let y = 400; y < 940; y += 26) {
      const shore = y < 560 ? 1345 + (y - 430) * 0.2 : 1360 + (y - 560) * 0.12;
      const x0 = shore + 18 + rand() * 6;
      const bw = 18 + rand() * 18, bh = 14 + rand() * 6;
      g.fillStyle = 'rgba(40,30,30,.25)'; g.fillRect(x0 + 3, y + 3, bw, bh);
      g.fillStyle = roofs[(rand() * roofs.length) | 0]; g.fillRect(x0, y, bw, bh);
      if (rand() < 0.6) { g.fillStyle = roofs[(rand() * roofs.length) | 0]; g.fillRect(x0 + bw + 10, y + 2, 14 + rand() * 10, 12 + rand() * 4); }
    }
    g.restore();

    // the stacks: footprints and long shadows (the cylinders stand up in the sprite layer)
    STACKS.forEach(([x, y]) => {
      g.strokeStyle = 'rgba(25,25,25,.22)'; g.lineWidth = 18; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 150, y + 105); g.stroke();
      g.fillStyle = 'rgba(60,55,50,.6)'; g.beginPath(); g.arc(x, y, 12, 0, Math.PI * 2); g.fill();
    });

    // causeway & sand spit (sand + dune grass)
    g.fillStyle = '#e6d2ae'; g.fill(paths.causeway); g.fill(paths.spit);
    g.save(); g.clip(paths.spit);
    for (let i = 0; i < 260; i++) {
      const y = 470 + rand() * 1000, x = 760 + (y - 470) * 0.23 + rand() * 110;
      g.fillStyle = rand() < 0.7 ? 'rgba(130,140,80,.45)' : 'rgba(255,255,255,.35)';
      g.beginPath(); g.ellipse(x, y, 3 + rand() * 6, 2 + rand() * 3, rand() * Math.PI, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    // estuary marsh islands
    paths.marsh.forEach((p, i) => {
      g.fillStyle = '#6f8b56'; g.fill(p);
      g.save(); g.clip(p);
      const m = MARSH[i];
      for (let k = 0; k < m.r * 1.4; k++) {
        const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * m.r;
        g.fillStyle = rand() < 0.5 ? 'rgba(160,170,90,.6)' : 'rgba(50,70,40,.35)';
        g.fillRect(m.x + Math.cos(a) * d, m.y + Math.sin(a) * d, 2, 5);
      }
      g.restore();
    });

    // Morro Rock: dark footprint and a long shadow on the water (the dome stands up in the sprite layer)
    g.fillStyle = 'rgba(8,24,38,.3)';
    g.beginPath(); g.ellipse(ROCK.x + 125, ROCK.y + 75, ROCK.r * 1.6, ROCK.r * 0.95, 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d322c'; g.fill(paths.rock);

    // little sandy beach on the north shore (where the people stand)
    g.save(); g.clip(paths.mainland);
    g.fillStyle = '#ead8b6';
    g.beginPath(); g.ellipse(BEACH.x, BEACH.y, BEACH.rx, BEACH.ry, -0.08, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e3cda6';
    g.beginPath(); g.ellipse(BEACH.x + 10, BEACH.y + 18, BEACH.rx * 0.9, BEACH.ry * 0.8, -0.1, 0, Math.PI * 2); g.fill();
    // a beach towel and an umbrella shadow, for company
    g.fillStyle = '#d46f9c'; g.fillRect(1010, 168, 26, 14);
    g.fillStyle = '#fbf3ec'; for (let i = 0; i < 3; i++) g.fillRect(1013 + i * 8, 168, 3, 14);
    g.restore();

    // docks (passable: otters swim under them)
    g.fillStyle = '#8b6a4f';
    g.fillRect(1088, 228, 14, 100);           // T-pier stem
    g.fillRect(1035, 320, 120, 14);           // T-pier top
    [470, 560, 650, 740, 830].forEach((y) => {
      const shore = y < 560 ? 1345 + (y - 430) * 0.2 : 1360 + (y - 560) * 0.12;
      g.fillRect(shore - 58, y, 62, 10);
    });
    g.fillStyle = '#9b7a5c'; g.fillRect(1238, 486, 54, 26); // sea lion float
    g.strokeStyle = 'rgba(40,25,15,.35)'; g.lineWidth = 1;
    for (let x = 1036; x < 1155; x += 6) { g.beginPath(); g.moveTo(x, 320); g.lineTo(x, 334); g.stroke(); }

    // map labels
    g.textAlign = 'center';
    const label = (t, x, y, size, rot = 0, alpha = 0.7) => {
      g.save(); g.translate(x, y); g.rotate(rot);
      g.font = `italic 400 ${size}px "Fraunces", Georgia, serif`;
      g.fillStyle = `rgba(251,243,236,${alpha})`;
      g.fillText(t, 0, 0); g.restore();
    };
    label('Pacific Ocean', 260, 420, 34, 0, 0.55);
    label('Morro Rock', 520, 420, 24);
    label('Morro Bay', 1110, 1060, 34, 0, 0.6);
    label('Sand Spit', 905, 1260, 20, 1.36, 0.8);
    label('Embarcadero', 1520, 700, 20, 0, 0.85);
    label('The Stacks', 1540, 270, 18, 0, 0.85);
    label('Estuary', 1440, 1210, 20, 0, 0.85);
    label('Kelp Forest', 300, 1090, 18, 0, 0.6);

    // collision mask (land = 1)
    const mw = Math.ceil(W * MASK_SCALE), mh = Math.ceil(H * MASK_SCALE);
    const mc = document.createElement('canvas'); mc.width = mw; mc.height = mh;
    const mg = mc.getContext('2d');
    mg.fillStyle = '#fff'; mg.fillRect(0, 0, mw, mh);
    mg.scale(MASK_SCALE, MASK_SCALE); mg.fillStyle = '#000';
    [paths.mainland, paths.causeway, paths.rock, paths.spit, ...paths.marsh].forEach((p) => mg.fill(p));
    const data = mg.getImageData(0, 0, mw, mh).data;
    const mask = new Uint8Array(mw * mh);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4] < 128 ? 1 : 0;

    // minimap backdrop
    const mini = document.createElement('canvas'); mini.width = 200; mini.height = 140;
    mini.getContext('2d').drawImage(c, M, M, W, H, 0, 0, 200, 140);

    world = { canvas: c, mask, mw, mh, mini };
    return world;
  }

  function isLand(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return true;
    return world.mask[((y * MASK_SCALE) | 0) * world.mw + ((x * MASK_SCALE) | 0)] === 1;
  }
  const RADIUS = 13;
  function blocked(x, y) {
    if (isLand(x, y)) return true;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      if (isLand(x + Math.cos(a) * RADIUS, y + Math.sin(a) * RADIUS)) return true;
    }
    return false;
  }
  function nudgeToWater(x, y) {
    if (!blocked(x, y)) return [x, y];
    for (let r = 10; r < 300; r += 10) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
        if (!blocked(nx, ny)) return [nx, ny];
      }
    }
    return [x, y];
  }

  /* ---------------- sprites ---------------- */
  function drawOtter(g, x, y, angle, onBack, t, holdingStar) {
    g.save(); g.translate(x, y); g.rotate(angle);
    const bob = onBack ? Math.sin(t * 2) * 0.06 : 0;
    g.rotate(bob);
    // water ring
    g.strokeStyle = 'rgba(235,250,250,.28)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(0, 0, 27, 16, 0, 0, Math.PI * 2); g.stroke();
    if (!onBack) {
      const kick = Math.sin(t * 14) * 3;
      g.fillStyle = '#6f4636';
      g.beginPath(); g.ellipse(-24, 0, 9, 3.6, 0, 0, Math.PI * 2); g.fill();                 // tail
      g.beginPath(); g.ellipse(-14, -8 - kick * 0.3, 5.5, 3, 0.5, 0, Math.PI * 2); g.fill(); // hind feet
      g.beginPath(); g.ellipse(-14, 8 + kick * 0.3, 5.5, 3, -0.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a5b47';
      g.beginPath(); g.ellipse(0, 0, 18, 9.5, 0, 0, Math.PI * 2); g.fill();                 // body
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.beginPath(); g.ellipse(-2, -3, 12, 3.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#6f4636';
      g.beginPath(); g.ellipse(9, -7 + kick * 0.2, 3, 2, 0, 0, Math.PI * 2); g.fill();       // front paws
      g.beginPath(); g.ellipse(9, 7 - kick * 0.2, 3, 2, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#94644f';
      g.beginPath(); g.arc(17, 0, 8.5, 0, Math.PI * 2); g.fill();                           // head
      g.beginPath(); g.arc(13, -6.5, 2.4, 0, Math.PI * 2); g.arc(13, 6.5, 2.4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ecd2bd';
      g.beginPath(); g.ellipse(21, 0, 5, 5.6, 0, 0, Math.PI * 2); g.fill();                 // face
      g.fillStyle = '#2a1820';
      g.beginPath(); g.arc(25.3, 0, 1.7, 0, Math.PI * 2); g.fill();                         // nose
      g.beginPath(); g.arc(19, -3.4, 1.2, 0, Math.PI * 2); g.arc(19, 3.4, 1.2, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#6f4636';
      g.beginPath(); g.ellipse(-24, 0, 8, 3.4, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(-18, -7, 4, 3, 0, 0, Math.PI * 2); g.ellipse(-18, 7, 4, 3, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a5b47';
      g.beginPath(); g.ellipse(0, 0, 18, 10, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e9c6ae';
      g.beginPath(); g.ellipse(0, 0, 13, 7, 0, 0, Math.PI * 2); g.fill();                   // belly
      g.fillStyle = '#ecd2bd';
      g.beginPath(); g.arc(17, 0, 8.5, 0, Math.PI * 2); g.fill();                           // face up
      g.fillStyle = '#94644f';
      g.beginPath(); g.arc(13, -7, 2.4, 0, Math.PI * 2); g.arc(13, 7, 2.4, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#2a1820'; g.lineWidth = 1.3; g.lineCap = 'round';
      g.beginPath(); g.arc(17, -3.5, 1.8, 0.2, Math.PI - 0.2); g.stroke();                  // sleepy eyes
      g.beginPath(); g.arc(17, 3.5, 1.8, 0.2, Math.PI - 0.2); g.stroke();
      g.fillStyle = '#2a1820'; g.beginPath(); g.arc(22, 0, 1.6, 0, Math.PI * 2); g.fill();
      if (holdingStar) {
        g.fillStyle = '#f6c9a8'; sparkle(g, 4, 0, 6); g.fill();
      }
      g.fillStyle = '#6f4636';
      g.beginPath(); g.ellipse(6, -4.5, 2.8, 2, 0, 0, Math.PI * 2); g.ellipse(6, 4.5, 2.8, 2, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function drawRaft(g, t, glow) {
    const ang = [0, 2.1, 4.2];
    if (glow) {
      const gg = g.createRadialGradient(RAFT.x, RAFT.y, 0, RAFT.x, RAFT.y, 90);
      gg.addColorStop(0, 'rgba(246,201,168,.35)'); gg.addColorStop(1, 'rgba(246,201,168,0)');
      g.fillStyle = gg; g.beginPath(); g.arc(RAFT.x, RAFT.y, 90, 0, Math.PI * 2); g.fill();
    }
    ang.forEach((a, i) => {
      const r = 26 + Math.sin(t * 1.2 + i) * 1.5;
      const x = RAFT.x + Math.cos(a + t * 0.05) * r, y = RAFT.y + Math.sin(a + t * 0.05) * r;
      drawOtter(g, x, y, a + t * 0.05 + Math.PI, true, t + i, false);
    });
  }

  // sea lions on the floating dock: [x, y, facing, pose]
  const SEA_LIONS = [[1247, 500, 1, 'bark'], [1266, 506, -1, 'flat'], [1283, 496, 1, 'sit']];
  const SWIMMER = { x: 1210, y: 535, r: 26 };

  // a little side-view California sea lion, feet at (0,0); s = scale, face = 1 right / -1 left
  function drawSeaLion(o, x, y, s, face, pose, t, barking) {
    const dark = '#3c2a20', body = '#5b4130', light = '#7b5a43';
    o.save(); o.translate(x, y); o.scale(s * face, s);
    o.fillStyle = 'rgba(20,14,10,.3)';                                       // shadow on the dock
    o.beginPath(); o.ellipse(0, 0.6, 13, 2.2, 0, 0, Math.PI * 2); o.fill();
    o.fillStyle = dark;                                                       // rear flippers
    o.beginPath(); o.ellipse(-12.5, -0.6, 3, 1.1, 0.45, 0, Math.PI * 2); o.ellipse(-12, 0.3, 3, 1.1, -0.35, 0, Math.PI * 2); o.fill();
    if (pose === 'flat') {
      // stretched out sunbathing, chin on the dock
      o.fillStyle = body; o.beginPath(); o.ellipse(-1, -2.6, 11.5, 3.3, 0, 0, Math.PI * 2); o.fill();
      o.fillStyle = light; o.beginPath(); o.ellipse(-2, -4.2, 7.5, 1.1, 0, 0, Math.PI * 2); o.fill();
      o.fillStyle = dark; o.beginPath(); o.ellipse(4, -0.6, 2.6, 1, 0.3, 0, Math.PI * 2); o.fill();       // front flipper
      o.fillStyle = body; o.beginPath(); o.ellipse(10.5, -2.4, 3.1, 2.4, 0, 0, Math.PI * 2); o.fill();   // head
      o.beginPath(); o.ellipse(13.4, -1.8, 1.9, 1.3, 0.2, 0, Math.PI * 2); o.fill();                     // snout
      o.strokeStyle = '#1e1612'; o.lineWidth = 0.6;
      o.beginPath(); o.arc(10.6, -3.1, 0.9, 0.3, Math.PI - 0.3); o.stroke();                              // sleepy eye
    } else {
      // propped up on front flippers, head raised (barking or looking around)
      const nod = pose === 'bark' ? (barking ? Math.sin(t * 14) * 0.18 : 0) : Math.sin(t * 0.9) * 0.12;
      o.fillStyle = body;
      o.beginPath(); o.ellipse(-5, -2.4, 8.5, 3.2, 0.06, 0, Math.PI * 2); o.fill();                     // hind body
      o.beginPath(); o.ellipse(2.6, -5.6, 4.6, 4.6, -0.5, 0, Math.PI * 2); o.fill();                     // chest
      o.fillStyle = light; o.beginPath(); o.ellipse(-4.5, -4.4, 5.5, 1, 0.08, 0, Math.PI * 2); o.fill(); // sheen on the back
      o.fillStyle = dark; o.beginPath(); o.ellipse(4.6, -1.6, 1.5, 3.2, 0.35, 0, Math.PI * 2); o.fill();  // front flipper
      o.save(); o.translate(4.6, -9); o.rotate(-0.35 + nod);                                              // neck + head
      o.fillStyle = body;
      o.beginPath(); o.ellipse(0, 0, 2.6, 4, 0.3, 0, Math.PI * 2); o.fill();
      o.beginPath(); o.ellipse(1.6, -3.6, 3, 2.4, 0, 0, Math.PI * 2); o.fill();
      o.beginPath(); o.ellipse(4.4, -3.2, 2, 1.3, 0.15, 0, Math.PI * 2); o.fill();                      // snout
      o.fillStyle = '#1e1612';
      o.beginPath(); o.arc(1.9, -4.4, 0.6, 0, Math.PI * 2); o.fill();                                    // eye
      o.beginPath(); o.arc(6.2, -3.4, 0.55, 0, Math.PI * 2); o.fill();                                   // nose
      if (pose === 'bark' && barking && Math.sin(t * 14) > 0) {                                          // open mouth
        o.strokeStyle = '#1e1612'; o.lineWidth = 0.7; o.beginPath(); o.moveTo(3.4, -2.3); o.lineTo(6, -1.8); o.stroke();
      }
      o.strokeStyle = 'rgba(240,235,225,.75)'; o.lineWidth = 0.35;                                       // whiskers
      o.beginPath(); o.moveTo(5.4, -2.9); o.lineTo(7.6, -2.2); o.moveTo(5.4, -2.6); o.lineTo(7.4, -1.5); o.stroke();
      o.restore();
    }
    o.restore();
  }

  // a sea lion swimming beside the dock: just the head above the water, with a ripple
  function drawSwimmingSeaLion(o, t) {
    const a = reduceMotion ? 0 : t * 0.6;
    const wx = SWIMMER.x + Math.cos(a) * SWIMMER.r, wy = SWIMMER.y + Math.sin(a) * SWIMMER.r * 0.7;
    const q = project(wx, wy), s = Math.max(0.9, 1.3 * q.k * view.scale);
    const face = Math.cos(a + Math.PI / 2) >= 0 ? 1 : -1;
    o.save(); o.translate(q.x, q.y);
    o.strokeStyle = 'rgba(235,250,250,.55)'; o.lineWidth = 1.2;
    o.beginPath(); o.ellipse(0, 0, 9 * s, 2.6 * s, 0, 0, Math.PI * 2); o.stroke();
    o.scale(s * face, s);
    o.fillStyle = '#5b4130';
    o.beginPath(); o.ellipse(-1, -1.5, 3.4, 2.4, 0, Math.PI, Math.PI * 2); o.fill();                   // back just breaking the surface
    o.beginPath(); o.ellipse(2.4, -3.6, 2.7, 2.2, 0, 0, Math.PI * 2); o.fill();                        // head
    o.beginPath(); o.ellipse(4.8, -3.2, 1.7, 1.1, 0.1, 0, Math.PI * 2); o.fill();                      // snout
    o.fillStyle = '#1e1612'; o.beginPath(); o.arc(2.8, -4.3, 0.55, 0, Math.PI * 2); o.fill();
    o.restore();
  }

  // "Arf!" when Ollie swims close
  // little pop-up sounds: "Arf!" from the sea lions, "meep!" from the raft
  function drawBark(o, x, y, text = 'Arf!', alpha = 1, fill = '#fbf3ec') {
    o.save(); o.globalAlpha = Math.max(0, Math.min(1, alpha));
    o.font = '700 13px "Instrument Sans", system-ui, sans-serif'; o.textAlign = 'center';
    o.lineWidth = 3; o.strokeStyle = 'rgba(30,22,18,.75)'; o.strokeText(text, x, y);
    o.fillStyle = fill; o.fillText(text, x, y);
    o.restore();
  }


  // tiny standing figures, feet at (x, y)
  function drawPerson(g, p, t, waving, sx = p.x, sy = p.y, s = 1) {
    const k = (p.h / 28) * s;
    g.save(); g.translate(sx, sy); g.scale(k, k);
    g.fillStyle = 'rgba(40,30,20,.22)';
    g.beginPath(); g.ellipse(0, 0, 8, 2.6, 0, 0, Math.PI * 2); g.fill();          // shadow
    g.fillStyle = p.pants;
    g.fillRect(-3.6, -9, 3, 9); g.fillRect(0.6, -9, 3, 9);                      // legs
    if (p.style === 'long' || p.style === 'pigtails') { g.beginPath(); g.moveTo(-6, -7); g.lineTo(6, -7); g.lineTo(4, -15); g.lineTo(-4, -15); g.fill(); } // skirt
    g.fillStyle = p.shirt;
    g.beginPath(); g.moveTo(-5, -8); g.lineTo(5, -8); g.lineTo(4.5, -19); g.quadraticCurveTo(0, -21, -4.5, -19); g.closePath(); g.fill(); // body
    // arms (one waves when Ollie is close)
    g.strokeStyle = p.skin; g.lineWidth = 2.2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-4.5, -18); g.lineTo(-6.5, -11); g.stroke();
    const wave = waving ? Math.sin(t * 9 + p.x) * 0.5 : 0;
    g.save(); g.translate(4.5, -18); g.rotate(waving ? -2.2 + wave : 0.25);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 7.5); g.stroke(); g.restore();
    // hair behind the head
    g.fillStyle = p.hair;
    if (p.style === 'long') { g.beginPath(); g.ellipse(0, -21, 6.2, 6.8, 0, 0, Math.PI * 2); g.fill(); g.fillRect(-6.2, -24, 12.4, 7); }
    if (p.style === 'madi') { // shoulder-length waves
      g.beginPath(); g.ellipse(0, -22, 6.6, 6.6, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(-5, -18, 3, 4.5, 0.3, 0, Math.PI * 2); g.ellipse(5, -18, 3, 4.5, -0.3, 0, Math.PI * 2); g.fill();
    }
    if (p.style === 'pigtails') { g.beginPath(); g.arc(-6, -24, 2.6, 0, Math.PI * 2); g.arc(6, -24, 2.6, 0, Math.PI * 2); g.fill(); }
    // head
    g.fillStyle = p.skin; g.beginPath(); g.arc(0, -24, 4.8, 0, Math.PI * 2); g.fill();
    // hair on top
    g.fillStyle = p.hair;
    g.beginPath(); g.arc(0, -24.6, 5, Math.PI * 1.02, Math.PI * 1.98); g.fill();
    if (p.style === 'madi') { // full bangs
      g.beginPath(); g.moveTo(-5, -25); g.quadraticCurveTo(0, -31, 5, -25); g.lineTo(4.4, -23); g.quadraticCurveTo(0, -24.8, -4.4, -23); g.closePath(); g.fill();
    }
    // face
    g.fillStyle = '#2a1820';
    g.beginPath(); g.arc(-1.7, -23.4, 0.6, 0, Math.PI * 2); g.arc(1.7, -23.4, 0.6, 0, Math.PI * 2); g.fill();
    if (p.style === 'madi') { // a butterfly that flutters around her
      const bx = 9 + Math.sin(t * 1.3) * 3, by = -30 + Math.cos(t * 1.7) * 2.5, f = 0.4 + Math.abs(Math.sin(t * 12)) * 0.6;
      g.fillStyle = '#e07a3e';
      g.beginPath(); g.ellipse(bx - 1.6 * f, by, 1.8 * f, 1.4, 0, 0, Math.PI * 2); g.ellipse(bx + 1.6 * f, by, 1.8 * f, 1.4, 0, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function wrapText(g, text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (g.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function roundedRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  /* ---------------- game state ---------------- */
  const dlg = $('#otter-game-dialog');
  if (!dlg) return;
  const canvas = $('.game__canvas', dlg);
  const ctx = canvas.getContext('2d');           // sprite layer (upright things), screen space
  const stage = $('.game__stage', dlg);
  const ground = $('.game__ground', dlg);       // flat map, tilted with CSS 3D
  const gctx = ground.getContext('2d');
  const miniCanvas = $('.game__minimap', dlg);
  const mctx = miniCanvas.getContext('2d');
  const card = $('.game__card', dlg);
  const intro = $('.game__intro', dlg);
  const countStars = $('[data-g="stars"]', dlg);
  const countPlaces = $('[data-g="places"]', dlg);
  const speechLive = $('[data-g="speech"]', dlg);

  let state, running = false, raf = 0, last = 0, cardTimer = 0;
  const keys = new Set();
  const stick = { active: false, ox: 0, oy: 0, x: 0, y: 0, id: null };
  let view = { w: 0, h: 0, scale: 1, dpr: 1, P: 1000, gw: 0, gh: 0, top: 0, gdpr: 1 };

  function reset() {
    buildWorld();
    const [sx, sy] = nudgeToWater(START.x, START.y);
    state = {
      x: sx, y: sy, vx: 0, vy: 0, angle: Math.PI, idle: 0, onBack: false, t: 0,
      stars: STARS.map(([x, y]) => { const [nx, ny] = nudgeToWater(x, y); return { x: nx, y: ny, got: false, pop: 0 }; }),
      found: new Set(), ripples: [], rippleClock: 0, won: false, raftHintAt: -99,
      camX: sx, camY: sy,
      near: false, metMadi: false, visitDone: false, queue: [], speech: '', speechAlpha: 0, speechIdx: 0, speechNext: 0,
    };
    if (speechLive) speechLive.textContent = '';
    updateCounts();
  }

  function updateCounts() {
    countStars.textContent = state.stars.filter((s) => s.got).length;
    countPlaces.textContent = state.found.size;
  }

  function showCard(title, text, { actions = false, persist = false } = {}) {
    clearTimeout(cardTimer);
    card.innerHTML = '';
    const h = document.createElement('p'); h.className = 'game__card-title'; h.textContent = title;
    const p = document.createElement('p'); p.className = 'game__card-text'; p.textContent = text;
    card.append(h, p);
    if (actions) {
      const row = document.createElement('div'); row.className = 'game__card-actions';
      const again = document.createElement('button'); again.type = 'button'; again.className = 'pill pill--solid'; again.textContent = 'Play again';
      again.addEventListener('click', () => { reset(); hideCard(); canvas.focus(); });
      const keep = document.createElement('button'); keep.type = 'button'; keep.className = 'pill pill--ghost'; keep.textContent = 'Keep floating';
      keep.addEventListener('click', () => { hideCard(); canvas.focus(); });
      row.append(again, keep); card.append(row);
    }
    card.classList.add('is-visible');
    if (!persist) cardTimer = setTimeout(hideCard, 7000);
  }
  function hideCard() { card.classList.remove('is-visible'); }

  /* ---------------- sizing + 3D camera ---------------- */
  function resize() {
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.w = canvas.clientWidth; view.h = canvas.clientHeight;
    canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
    view.scale = Math.max(0.6, Math.min(1.05, Math.min(view.w / 900, view.h / 640)));
    // The ground plane is tilted back with CSS 3D. Size it so that, after perspective,
    // it always covers the screen: more plane above the centre (far) than below (near).
    const P = view.P = Math.max(view.w, view.h) * 1.25;
    const halfH = view.h / 2;
    const aTop = ((halfH * P) / (P * COS_T - halfH * SIN_T)) * 1.08;
    const aBot = ((halfH * P) / (P * COS_T + halfH * SIN_T)) * 1.08;
    const kTop = P / (P + aTop * SIN_T);
    view.gw = Math.ceil((view.w / kTop) * 1.06);
    view.gh = Math.ceil(aTop + aBot);
    view.top = aTop;
    // keep the ground texture affordable on phones
    view.gdpr = Math.max(0.75, Math.min(view.dpr, Math.sqrt(4.5e6 / (view.gw * view.gh))));
    stage.style.perspective = `${P}px`;
    Object.assign(ground.style, {
      width: `${view.gw}px`, height: `${view.gh}px`,
      left: `${(view.w - view.gw) / 2}px`, top: `${halfH - aTop}px`,
      transformOrigin: `50% ${aTop}px`, transform: `rotateX(${TILT}rad)`,
    });
    ground.width = Math.round(view.gw * view.gdpr); ground.height = Math.round(view.gh * view.gdpr);
  }

  // world point (+ optional height above the water) -> screen point, matching the CSS tilt exactly
  function project(wx, wy, h = 0) {
    const X = (wx - state.camX) * view.scale, Y = (wy - state.camY) * view.scale, Hh = h * view.scale;
    const y3 = Y * COS_T - Hh * SIN_T, z3 = Y * SIN_T + Hh * COS_T;
    const k = view.P / (view.P - z3);
    return { x: view.w / 2 + X * k, y: view.h / 2 + y3 * k, k };
  }

  /* ---------------- upright sprites ---------------- */
  function drawRock(o, t) {
    const b = project(ROCK.x, ROCK.y), tp = project(ROCK.x - 12, ROCK.y + 12, ROCK_H);
    const rw = ROCK.r * view.scale * b.k, rb = rw * COS_T;
    const bx = b.x, by = b.y, tx = tp.x, ty = tp.y;
    o.save();
    o.beginPath();
    o.moveTo(bx - rw, by);
    o.bezierCurveTo(bx - rw, by - (by - ty) * 0.55, tx - rw * 0.55, ty, tx, ty);
    o.bezierCurveTo(tx + rw * 0.65, ty, bx + rw, by - (by - ty) * 0.5, bx + rw, by);
    o.ellipse(bx, by, rw, rb, 0, 0, Math.PI);
    o.closePath();
    const lit = o.createLinearGradient(bx - rw, 0, bx + rw, 0); // sun from the west
    lit.addColorStop(0, '#a48e7c'); lit.addColorStop(0.45, '#76624f'); lit.addColorStop(1, '#382e28');
    o.fillStyle = lit; o.fill();
    o.clip();
    const v = o.createLinearGradient(0, ty, 0, by + rb);
    v.addColorStop(0, 'rgba(255,240,225,.12)'); v.addColorStop(1, 'rgba(20,14,12,.5)');
    o.fillStyle = v; o.fillRect(bx - rw, ty, rw * 2, by + rb - ty);
    // irregular weathered gullies, not too tidy
    o.strokeStyle = 'rgba(28,20,18,.2)'; o.lineWidth = Math.max(1, 1.3 * b.k * view.scale);
    [[-0.62, 0.35], [-0.3, 0.12], [0.08, 0.22], [0.36, 0.08], [0.6, 0.4]].forEach(([u, v]) => {
      const sx0 = bx + u * rw * 0.75, sy0 = ty + (by - ty) * v;
      o.beginPath(); o.moveTo(sx0, sy0);
      o.quadraticCurveTo(sx0 + u * rw * 0.15, (sy0 + by) / 2, bx + u * rw * 1.02, by + rb * 0.45); o.stroke();
    });
    // seagulls perched on the ledges: [across, down the face, facing]
    const gs = Math.max(0.9, 1.25 * b.k * view.scale);
    [[-0.1, 0.12, 1], [0.25, 0.2, -1], [-0.45, 0.34, 1], [0.05, 0.4, 1], [0.5, 0.46, -1],
      [-0.25, 0.56, -1], [0.3, 0.62, 1], [-0.58, 0.7, 1], [0.62, 0.72, -1], [0.02, 0.78, -1]].forEach(([u, v, face], i) => {
      const x = bx + (tx - bx) * (1 - v) + u * rw * (0.3 + 0.7 * v), y = ty + v * (by - ty);
      const bob = reduceMotion ? 0 : Math.sin(t * 2 + i * 1.7) * 0.4 * gs;
      drawPerchedGull(o, x, y + bob, gs, face);
    });
    o.restore();

    // a few gulls circling above the Rock
    for (let i = 0; i < 4; i++) {
      const a = (reduceMotion ? 0 : t * 0.35) + i * 1.6;
      const orbit = ROCK.r * (1.1 + (i % 2) * 0.35);
      const q = project(ROCK.x + Math.cos(a) * orbit, ROCK.y + Math.sin(a) * orbit * 0.8, ROCK_H + 40 + i * 22);
      drawFlyingGull(o, q.x, q.y, Math.max(0.9, 1.3 * q.k * view.scale), reduceMotion ? 0.5 : Math.sin(t * 7 + i * 2));
    }
  }

  // a tiny seagull sitting down: white body, grey wing, yellow beak (s = scale, face = 1 right / -1 left)
  function drawPerchedGull(o, x, y, s, face) {
    o.save(); o.translate(x, y); o.scale(s * face, s);
    o.fillStyle = 'rgba(20,14,12,.35)';                                     // little shadow on the ledge
    o.beginPath(); o.ellipse(0.5, 2.6, 4.8, 1.2, 0, 0, Math.PI * 2); o.fill();
    o.fillStyle = '#2b2b30';                                                 // black tail tip
    o.beginPath(); o.moveTo(-4.2, -0.6); o.lineTo(-6.6, -1.6); o.lineTo(-5.8, 0.6); o.closePath(); o.fill();
    o.fillStyle = '#fbfaf6';                                                 // body
    o.beginPath(); o.ellipse(0, 0, 4.8, 2.7, -0.08, 0, Math.PI * 2); o.fill();
    o.fillStyle = '#9aa4ad';                                                 // folded grey wing
    o.beginPath(); o.ellipse(-1, -0.9, 3.7, 1.6, -0.12, 0, Math.PI * 2); o.fill();
    o.fillStyle = '#fbfaf6';                                                 // head
    o.beginPath(); o.arc(3.9, -2.4, 2, 0, Math.PI * 2); o.fill();
    o.fillStyle = '#f2b134';                                                 // beak
    o.beginPath(); o.moveTo(5.6, -2.6); o.lineTo(7.6, -2.1); o.lineTo(5.6, -1.7); o.closePath(); o.fill();
    o.fillStyle = '#1e1a1f';                                                 // eye
    o.beginPath(); o.arc(4.4, -2.8, 0.45, 0, Math.PI * 2); o.fill();
    o.restore();
  }

  // a gull in flight: the classic "m" wing shape, flapping (flap -1..1)
  function drawFlyingGull(o, x, y, s, flap) {
    const w = 9 * s, lift = flap * 3 * s;
    o.save(); o.lineCap = 'round'; o.lineJoin = 'round';
    const wings = () => {
      o.beginPath();
      o.moveTo(x - w, y + lift);
      o.quadraticCurveTo(x - w * 0.45, y - 3.2 * s - lift * 0.4, x, y);
      o.quadraticCurveTo(x + w * 0.45, y - 3.2 * s - lift * 0.4, x + w, y + lift);
    };
    o.strokeStyle = 'rgba(40,46,56,.45)'; o.lineWidth = 3.4 * Math.max(1, s * 0.8); wings(); o.stroke(); // soft outline so they read against the haze
    o.strokeStyle = '#fbfaf6'; o.lineWidth = 1.9 * Math.max(1, s * 0.8); wings(); o.stroke();
    o.fillStyle = '#fbfaf6'; o.beginPath(); o.ellipse(x, y + 0.4 * s, 1.6 * s, 1.1 * s, 0, 0, Math.PI * 2); o.fill();
    o.restore();
  }

  function drawStack(o, x, y) {
    const b = project(x, y), tp = project(x, y, STACK_H);
    const w = 11 * view.scale * b.k, wt = 9 * view.scale * tp.k;
    const body = o.createLinearGradient(b.x - w, 0, b.x + w, 0);
    body.addColorStop(0, '#f3eee6'); body.addColorStop(0.55, '#cbc4b9'); body.addColorStop(1, '#8c847a');
    o.fillStyle = body;
    o.beginPath(); o.moveTo(b.x - w, b.y); o.lineTo(tp.x - wt, tp.y); o.lineTo(tp.x + wt, tp.y); o.lineTo(b.x + w, b.y);
    o.ellipse(b.x, b.y, w, w * COS_T, 0, 0, Math.PI); o.closePath(); o.fill();
    o.fillStyle = '#3f3a36'; o.beginPath(); o.ellipse(tp.x, tp.y, wt, wt * COS_T, 0, 0, Math.PI * 2); o.fill();
  }

  function drawStarSprite(o, st, i, t) {
    const bob = reduceMotion ? 0 : Math.sin(t * 2 + i) * 6;
    const lift = st.got ? (1 - st.pop) * 50 : 0;
    const q = project(st.x, st.y, 30 + bob + lift);
    const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 3 + i) * 0.12;
    const grow = st.got ? 1 + (1 - st.pop) * 1.2 : 1;
    const a = st.got ? st.pop : 1;
    const r = 13 * pulse * grow * view.scale * q.k;
    const gl = o.createRadialGradient(q.x, q.y, 0, q.x, q.y, r * 2.4);
    gl.addColorStop(0, `rgba(246,201,168,${0.5 * a})`); gl.addColorStop(1, 'rgba(246,201,168,0)');
    o.fillStyle = gl; o.beginPath(); o.arc(q.x, q.y, r * 2.4, 0, Math.PI * 2); o.fill();
    o.fillStyle = `rgba(255,244,234,${a})`; sparkle(o, q.x, q.y, r); o.fill();
  }

  /* ---------------- loop ---------------- */
  function step(dt) {
    const s = state;
    const f = dt / 16.67;
    s.t += dt / 1000;

    // input
    let ix = 0, iy = 0;
    if (keys.has('ArrowLeft') || keys.has('a')) ix -= 1;
    if (keys.has('ArrowRight') || keys.has('d')) ix += 1;
    if (keys.has('ArrowUp') || keys.has('w')) iy -= 1;
    if (keys.has('ArrowDown') || keys.has('s')) iy += 1;
    if (stick.active) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, len = Math.hypot(dx, dy);
      if (len > 6) { const k = Math.min(1, len / 50); ix = (dx / len) * k; iy = (dy / len) * k; }
    }
    const il = Math.hypot(ix, iy);
    if (il > 1) { ix /= il; iy /= il; }

    const inKelp = KELP.some((k) => dist(s.x, s.y, k.x, k.y) < k.r);
    const maxV = inKelp ? 2.4 : 4.2;
    s.vx += ix * 0.38 * f; s.vy += iy * 0.38 * f;
    const drag = Math.pow(0.92, f);
    s.vx *= drag; s.vy *= drag;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp > maxV) { s.vx *= maxV / sp; s.vy *= maxV / sp; }

    const nx = s.x + s.vx * f, ny = s.y + s.vy * f;
    if (!blocked(nx, s.y)) s.x = nx; else s.vx *= -0.25;
    if (!blocked(s.x, ny)) s.y = ny; else s.vy *= -0.25;

    // facing + idle float
    if (sp > 0.25) {
      const target = Math.atan2(s.vy, s.vx);
      let d = target - s.angle; d = Math.atan2(Math.sin(d), Math.cos(d));
      s.angle += d * Math.min(1, 0.18 * f);
    }
    if (il < 0.05 && sp < 0.35) s.idle += dt; else s.idle = 0;
    s.onBack = s.idle > 1400;

    // ripples
    s.rippleClock -= dt;
    if (sp > 1 && s.rippleClock <= 0) { s.ripples.push({ x: s.x - Math.cos(s.angle) * 20, y: s.y - Math.sin(s.angle) * 20, age: 0 }); s.rippleClock = 140; }
    s.ripples.forEach((r) => (r.age += dt));
    s.ripples = s.ripples.filter((r) => r.age < 1100);

    // stars
    s.stars.forEach((st) => {
      if (!st.got && dist(s.x, s.y, st.x, st.y) < 30) { st.got = true; st.pop = 1; updateCounts(); }
      if (st.pop > 0) st.pop = Math.max(0, st.pop - dt / 600);
    });

    // places
    PLACES.forEach((p) => {
      if (!s.found.has(p.id) && dist(s.x, s.y, p.x, p.y) < p.r) {
        s.found.add(p.id); updateCounts();
        if (!s.won) showCard(p.name, p.fact);
      }
    });

    // Madi says hi from the beach: one chat per visit. Swim a little away and come back for another.
    const got = s.stars.filter((st) => st.got).length;
    const wasNear = s.near;
    // a bit of give before a visit counts as over, so drifting at the edge doesn't retrigger her
    s.near = dist(s.x, s.y, TALK_ZONE.x, TALK_ZONE.y) < (wasNear ? TALK_ZONE.r + 50 : TALK_ZONE.r);
    if (wasNear && !s.near) { s.visitDone = false; s.queue = []; }
    if (s.near && !wasNear && !s.visitDone) {
      s.visitDone = true;
      const starLine = got === STARS.length
        ? 'You have every star! Your raft is waiting by the harbor.'
        : got > 0 ? `You've found ${got} of ${STARS.length} stars. Keep floating!` : null;
      if (!s.metMadi) {
        s.metMadi = true;
        s.queue = ["Hi Ollie! I'm Madi. Welcome to Morro Bay!"];
        if (starLine) { s.queue.push(starLine); s.speechIdx = 1; } // already found a star: count now, fresh line next visit
      } else if (s.won) {
        s.queue = ['You did it, Ollie! Sweet dreams.'];
      } else {
        const lines = [
          starLine || 'No stars yet? Try swimming around Morro Rock!',
          'Take a deep breath… and float.',
          "Rest isn't a reward. It's how we float.",
          'Watch out, the sea lions are loud today!',
        ];
        s.queue = [lines[s.speechIdx++ % lines.length]];
      }
      s.speechNext = 0;
    }
    // play this visit's lines one after another, then let the bubble fade even if Ollie stays put
    if (s.near && s.queue.length && s.t >= s.speechNext) {
      const line = s.queue.shift();
      s.speech = line;
      if (speechLive) speechLive.textContent = `Madi: ${line}`;
      s.speechNext = s.t + 4.5;
    }
    const talking = s.near && s.speech && s.t < s.speechNext;
    if (talking) s.speechAlpha = Math.min(1, s.speechAlpha + dt / 250);
    else {
      s.speechAlpha = Math.max(0, s.speechAlpha - dt / 300);
      if (s.speechAlpha === 0) s.speech = '';
    }

    // raft / finale
    if (!s.won && dist(s.x, s.y, RAFT.x, RAFT.y) < 75) {
      if (got === STARS.length) {
        s.won = true;
        showCard(FINALE.name, `${FINALE.fact} You discovered ${s.found.size} of ${PLACES.length} places.`, { actions: true, persist: true });
      } else if (s.t - s.raftHintAt > 8) {
        s.raftHintAt = s.t;
        showCard('Your raft is waiting', `Bring back all ${STARS.length} stars, then come hold paws. You have ${got} so far.`);
      }
    }

    // camera follows smoothly; the painted margin fills the distance beyond the map edges
    const tx = Math.max(150, Math.min(W - 150, s.x + s.vx * 18));
    const ty = Math.max(200, Math.min(H - 120, s.y + s.vy * 18));
    s.camX += (tx - s.camX) * Math.min(1, 0.1 * f);
    s.camY += (ty - s.camY) * Math.min(1, 0.1 * f);
  }

  function render() {
    const s = state, t = s.t, sc = view.scale;

    /* ---- ground: the flat map, tilted back by CSS 3D ---- */
    const g = gctx, gd = view.gdpr;
    const left = s.camX - view.gw / 2 / sc, right = s.camX + view.gw / 2 / sc;
    const top = s.camY - view.top / sc, bottom = s.camY + (view.gh - view.top) / sc;
    g.setTransform(gd, 0, 0, gd, 0, 0);
    g.fillStyle = '#123a55'; g.fillRect(0, 0, view.gw, view.gh);
    g.setTransform(gd * sc, 0, 0, gd * sc, (view.gw / 2 - s.camX * sc) * gd, (view.top - s.camY * sc) * gd);
    g.drawImage(world.canvas, -M, -M);

    // shimmering wave glints
    if (!reduceMotion) {
      g.strokeStyle = 'rgba(220,245,245,.22)'; g.lineWidth = 1.5; g.lineCap = 'round';
      const step = 70;
      const x0 = Math.max(-M, left), x1 = Math.min(W + M, right), y0 = Math.max(-M, top), y1 = Math.min(H + M, bottom);
      for (let gx = Math.floor(x0 / step) * step; gx < x1 + step; gx += step) {
        for (let gy = Math.floor(y0 / step) * step; gy < y1 + step; gy += step) {
          const hsh = Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453; const r = hsh - Math.floor(hsh);
          const x = gx + r * step, y = gy + ((r * 7.13) % 1) * step;
          if (x >= 0 && y >= 0 && x < W && y < H && isLand(x, y)) continue;
          if ((x < 0 || y < 0 || x >= W || y >= H) && (x > 760 && y < 0)) continue; // north margin is land
          const ph = Math.sin(t * 1.6 + r * 20);
          if (ph < 0.2) continue;
          g.globalAlpha = (ph - 0.2) * 1.2;
          g.beginPath(); g.moveTo(x - 7, y); g.quadraticCurveTo(x, y - 3, x + 7, y); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }

    // ripples
    s.ripples.forEach((r) => {
      const k = r.age / 1100;
      g.strokeStyle = `rgba(235,250,250,${0.35 * (1 - k)})`; g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(r.x, r.y, 10 + k * 26, 6 + k * 14, s.angle, 0, Math.PI * 2); g.stroke();
    });

    // star reflections on the water, under the floating stars
    s.stars.forEach((st) => {
      if (st.got && st.pop <= 0) return;
      const a = st.got ? st.pop : 1;
      const gl = g.createRadialGradient(st.x, st.y, 0, st.x, st.y, 30);
      gl.addColorStop(0, `rgba(246,201,168,${0.35 * a})`); gl.addColorStop(1, 'rgba(246,201,168,0)');
      g.fillStyle = gl; g.beginPath(); g.arc(st.x, st.y, 30, 0, Math.PI * 2); g.fill();
    });

    const allStars = s.stars.every((st) => st.got);
    drawRaft(g, t, allStars && !s.won);
    drawOtter(g, s.x, s.y, s.angle, s.onBack, t, s.onBack && s.stars.some((st) => st.got));

    /* ---- sprites: upright things, drawn back to front in screen space ---- */
    const o = ctx;
    o.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    o.clearRect(0, 0, view.w, view.h);
    const sprites = [{ y: ROCK.y + ROCK.r * 0.5, draw: () => drawRock(o, t) }];
    STACKS.forEach(([x, y]) => sprites.push({ y, draw: () => drawStack(o, x, y) }));
    const nearDock = dist(s.x, s.y, 1265, 500) < 180;
    const barking = nearDock && !reduceMotion && (t % 2.4) < 0.9;
    SEA_LIONS.forEach(([x, y, face, pose]) => sprites.push({ y, draw: () => {
      const q = project(x, y), sz = Math.max(0.9, 1.3 * q.k * sc);
      drawSeaLion(o, q.x, q.y, sz, face, pose, t, barking);
      if (pose === 'bark' && barking) drawBark(o, q.x + 8 * sz * face, q.y - 24 * sz);
    } }));
    sprites.push({ y: SWIMMER.y, draw: () => drawSwimmingSeaLion(o, t) });
    // the raft says "meep!" when Ollie arrives (one each, in turn), then just the odd meep while Ollie stays
    const nearRaft = dist(s.x, s.y, RAFT.x, RAFT.y) < (s.raftSince != null ? 230 : 190);
    if (!nearRaft) s.raftSince = null;
    else if (s.raftSince == null) s.raftSince = t;
    if (nearRaft) {
      const since = t - s.raftSince;
      const QUIET = 4; // seconds between meeps after the hello
      [0, 2.1, 4.2].forEach((a0, i) => {
        let phase;
        if (since < 3) phase = since - i * 0.8;                                  // greeting: each otter once
        else if (Math.floor((since - 3) / QUIET) % 3 === i) phase = (since - 3) % QUIET; // then one at a time, rarely
        else return;
        if (phase < 0 || phase > 0.75) return;
        const a = a0 + t * 0.05, r = 26 + Math.sin(t * 1.2 + i) * 1.5;
        const hx = RAFT.x + Math.cos(a) * r - Math.cos(a) * 17, hy = RAFT.y + Math.sin(a) * r - Math.sin(a) * 17;
        const lift = reduceMotion ? 22 : 14 + phase * 30;
        sprites.push({ y: hy, draw: () => {
          const q = project(hx, hy, lift);
          drawBark(o, q.x, q.y, 'meep!', reduceMotion ? 1 : 1.4 - phase / 0.75, '#f6c9a8');
        } });
      });
    }
    const waving = (p) => (s.near && p.id !== 'mom' ? true : s.near && Math.sin(t * 0.8) > 0);
    PEOPLE.forEach((p) => sprites.push({ y: p.y, draw: () => { const q = project(p.x, p.y); drawPerson(o, p, t, waving(p), q.x, q.y, q.k * sc); } }));
    s.stars.forEach((st, i) => { if (!(st.got && st.pop <= 0)) sprites.push({ y: st.y, draw: () => drawStarSprite(o, st, i, t) }); });
    sprites.sort((a, b) => a.y - b.y).forEach((sp) => sp.draw());

    // atmospheric haze in the distance
    const haze = o.createLinearGradient(0, 0, 0, view.h * 0.42);
    haze.addColorStop(0, 'rgba(198,224,232,.6)'); haze.addColorStop(1, 'rgba(198,224,232,0)');
    o.fillStyle = haze; o.fillRect(0, 0, view.w, view.h * 0.42);

    // Madi's speech bubble, in screen space so it stays readable
    if (s.speech && s.speechAlpha > 0) {
      const head = project(MADI.x, MADI.y, MADI.h + 10), feet = project(MADI.x, MADI.y);
      const hx = head.x, hy = head.y;
      o.save(); o.globalAlpha = s.speechAlpha;
      o.font = '500 14px "Instrument Sans", system-ui, sans-serif';
      const lines = wrapText(o, s.speech, 200);
      const tw = Math.max(...lines.map((l) => o.measureText(l).width), 40);
      const bw = tw + 24, bh = 26 + lines.length * 19;
      const bx = Math.max(8, Math.min(view.w - bw - 8, hx - bw / 2));
      // above her head if there's room under the HUD, otherwise below her feet over the water
      const above = hy - bh - 12 >= 84;
      const by = above ? hy - bh - 12 : feet.y + 14;
      const tailX = Math.max(bx + 16, Math.min(bx + bw - 16, hx));
      o.shadowColor = 'rgba(0,0,0,.25)'; o.shadowBlur = 12; o.shadowOffsetY = 4;
      o.fillStyle = '#fbf3ec'; roundedRect(o, bx, by, bw, bh, 14); o.fill();
      o.shadowColor = 'transparent';
      o.beginPath();
      if (above) { o.moveTo(tailX - 7, by + bh - 1); o.lineTo(hx, by + bh + 10); o.lineTo(tailX + 7, by + bh - 1); }
      else { o.moveTo(tailX - 7, by + 1); o.lineTo(hx, by - 10); o.lineTo(tailX + 7, by + 1); }
      o.fill();
      o.fillStyle = '#a9412b'; o.font = '600 11px "Instrument Sans", system-ui, sans-serif';
      o.fillText('MADI', bx + 12, by + 17);
      o.fillStyle = '#2a1820'; o.font = '500 14px "Instrument Sans", system-ui, sans-serif';
      lines.forEach((l, i) => o.fillText(l, bx + 12, by + 36 + i * 19));
      o.restore();
    }

    // touch joystick
    if (stick.active) {
      o.strokeStyle = 'rgba(251,243,236,.5)'; o.lineWidth = 2;
      o.beginPath(); o.arc(stick.ox, stick.oy, 50, 0, Math.PI * 2); o.stroke();
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, len = Math.min(50, Math.hypot(dx, dy)), a = Math.atan2(dy, dx);
      o.fillStyle = 'rgba(251,243,236,.65)';
      o.beginPath(); o.arc(stick.ox + Math.cos(a) * len, stick.oy + Math.sin(a) * len, 18, 0, Math.PI * 2); o.fill();
    }

    // minimap
    const mw = miniCanvas.width, mh = miniCanvas.height, sx = mw / W, sy = mh / H;
    mctx.drawImage(world.mini, 0, 0, mw, mh);
    mctx.strokeStyle = 'rgba(251,243,236,.7)'; mctx.lineWidth = 1;
    const vwW = view.w / sc, vhW = view.h / sc;
    mctx.strokeRect((s.camX - vwW / 2) * sx, (s.camY - vhW * 0.75) * sy, vwW * sx, vhW * 1.15 * sy);
    s.stars.forEach((st) => { if (!st.got) { mctx.fillStyle = '#f6c9a8'; mctx.fillRect(st.x * sx - 2, st.y * sy - 2, 4, 4); } });
    mctx.fillStyle = allStars ? '#f6c9a8' : 'rgba(251,243,236,.6)';
    mctx.beginPath(); mctx.arc(RAFT.x * sx, RAFT.y * sy, 3.5, 0, Math.PI * 2); mctx.fill();
    mctx.fillStyle = '#fff'; mctx.strokeStyle = '#2a1820'; mctx.lineWidth = 1.5;
    mctx.beginPath(); mctx.arc(s.x * sx, s.y * sy, 4, 0, Math.PI * 2); mctx.fill(); mctx.stroke();
  }

  function loop(now) {
    const dt = Math.min(50, now - last); last = now;
    step(dt); render();
    raf = requestAnimationFrame(loop);
  }
  function play() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(loop); } }
  function pause() { running = false; cancelAnimationFrame(raf); }

  /* ---------------- start (the game lives on its own page) ---------------- */
  function start() {
    intro.hidden = true;
    canvas.focus();
    play();
  }
  function boot() {
    reset(); resize(); render();
    dlg.classList.add('is-open');
    $('.game__start', intro).focus();
  }
  $('.game__start', intro).addEventListener('click', start);
  // test hook, only with ?debug in the address
  if (new URLSearchParams(location.search).has('debug')) window.__ollie = () => state;
  // web fonts paint the map labels, so wait for them before drawing the world
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(boot);

  window.addEventListener('resize', () => { if (state) { resize(); render(); } });
  document.addEventListener('visibilitychange', () => {
    if (!state || !intro.hidden) return;
    if (document.hidden) pause(); else play();
  });

  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'];
  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (GAME_KEYS.includes(k) && intro.hidden && !(e.target instanceof Element && e.target.closest('button, a'))) { e.preventDefault(); keys.add(k); }
  });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key); });
  window.addEventListener('blur', () => keys.clear());

  // drag anywhere to swim (touch, pen or mouse)
  canvas.addEventListener('pointerdown', (e) => {
    if (!intro.hidden) return;
    const r = canvas.getBoundingClientRect();
    stick.active = true; stick.id = e.pointerId;
    stick.ox = stick.x = e.clientX - r.left; stick.oy = stick.y = e.clientY - r.top;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!stick.active || e.pointerId !== stick.id) return;
    const r = canvas.getBoundingClientRect();
    stick.x = e.clientX - r.left; stick.y = e.clientY - r.top;
  });
  const endStick = (e) => { if (e.pointerId === stick.id) { stick.active = false; stick.id = null; } };
  canvas.addEventListener('pointerup', endStick);
  canvas.addEventListener('pointercancel', endStick);
  canvas.addEventListener('lostpointercapture', endStick);
})();
