(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const canvas = $("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  const gameRoot = $("gameRoot");

  const scoreText = $("scoreText");
  const bestText = $("bestText");
  const bestTextMenu = $("bestTextMenu");
  const modeText = $("modeText");
  const skinText = $("skinText");
  const scoreTextOver = $("scoreTextOver");
  const bestTextOver = $("bestTextOver");

  const menuOverlay = $("menuOverlay");
  const gameOverOverlay = $("gameOverOverlay");
  const tapHint = $("tapHint");

  const startBtn = $("startBtn");
  const restartBtn = $("restartBtn");
  const menuBtn = $("menuBtn");
  const howBtn = $("howBtn");
  const howBox = $("howBox");

  const soundBtn = $("soundBtn");
  const dayNightBtn = $("dayNightBtn");
  const skinBtn = $("skinBtn");

  const DPR_MAX = 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  const STORAGE_KEY_BEST = "flappy.best.v1";
  const STORAGE_KEY_MODE = "flappy.mode.v1";
  const STORAGE_KEY_SKIN = "flappy.skin.v1";
  const STORAGE_KEY_SOUND = "flappy.sound.v1";

  const skins = [
    { name: "Neon", body: "#55f7ff", belly: "#eafcff", beak: "#ffcf5a", outline: "rgba(0,0,0,0.28)" },
    { name: "Sunset", body: "#ff6aa2", belly: "#ffe6f0", beak: "#ffd24d", outline: "rgba(0,0,0,0.28)" },
    { name: "Mint", body: "#48f1b6", belly: "#eafff7", beak: "#ffbe3b", outline: "rgba(0,0,0,0.28)" },
    { name: "Violet", body: "#7c5cff", belly: "#efeaff", beak: "#ffc857", outline: "rgba(0,0,0,0.28)" }
  ];

  const state = {
    phase: "menu",
    w: 0,
    h: 0,
    t: 0,
    dt: 0,
    score: 0,
    best: 0,
    mode: "day",
    skinIndex: 0,
    soundOn: true,
    shakeT: 0,
    hintT: 0,
    difficulty: 0,
    speed: 170,
    gap: 150
  };

  const bird = {
    x: 0,
    y: 0,
    r: 14,
    vy: 0,
    rot: 0
  };

  const pipes = [];
  const particles = [];
  const bg = {
    cloudX: 0,
    hillX: 0,
    groundX: 0,
    starSeed: Array.from({ length: 45 }, () => ({
      x: Math.random(),
      y: Math.random(),
      s: rand(0.6, 1.4),
      a: rand(0.35, 0.95)
    }))
  };

  let audio = null;

  function createAudio() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ac = new AudioCtx();
    const master = ac.createGain();
    master.gain.value = 0.8;
    master.connect(ac.destination);

    const api = {
      ac,
      master,
      enabled: true,
      ensureRunning() {
        if (ac.state === "suspended") ac.resume();
      },
      beep({ freq = 440, type = "sine", dur = 0.08, vol = 0.25, attack = 0.005, release = 0.05 } = {}) {
        if (!api.enabled) return;
        api.ensureRunning();
        const t0 = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + release);
        osc.connect(gain);
        gain.connect(master);
        osc.start(t0);
        osc.stop(t0 + dur + release + 0.02);
      }
    };
    return api;
  }

  function sfxFlap() {
    if (!audio) return;
    audio.beep({ freq: 740, type: "triangle", dur: 0.06, vol: 0.18, release: 0.06 });
  }

  function sfxScore() {
    if (!audio) return;
    audio.beep({ freq: 880, type: "sine", dur: 0.06, vol: 0.22, release: 0.07 });
    setTimeout(() => audio && audio.beep({ freq: 1180, type: "sine", dur: 0.05, vol: 0.16, release: 0.06 }), 55);
  }

  function sfxCrash() {
    if (!audio) return;
    audio.beep({ freq: 180, type: "sawtooth", dur: 0.12, vol: 0.22, release: 0.11 });
    setTimeout(() => audio && audio.beep({ freq: 120, type: "square", dur: 0.09, vol: 0.16, release: 0.11 }), 30);
  }

  function loadSettings() {
    const best = Number(localStorage.getItem(STORAGE_KEY_BEST));
    state.best = Number.isFinite(best) ? best : 0;

    const mode = localStorage.getItem(STORAGE_KEY_MODE);
    state.mode = mode === "night" ? "night" : "day";

    const skin = Number(localStorage.getItem(STORAGE_KEY_SKIN));
    state.skinIndex = Number.isFinite(skin) ? clamp(skin, 0, skins.length - 1) : 0;

    const sound = localStorage.getItem(STORAGE_KEY_SOUND);
    state.soundOn = sound === null ? true : sound === "1";
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY_BEST, String(state.best));
    localStorage.setItem(STORAGE_KEY_MODE, state.mode);
    localStorage.setItem(STORAGE_KEY_SKIN, String(state.skinIndex));
    localStorage.setItem(STORAGE_KEY_SOUND, state.soundOn ? "1" : "0");
  }

  function applyUiFromState() {
    scoreText.textContent = String(state.score);
    bestText.textContent = String(state.best);
    bestTextMenu.textContent = String(state.best);
    bestTextOver.textContent = String(state.best);
    scoreTextOver.textContent = String(state.score);
    modeText.textContent = state.mode === "night" ? "Đêm" : "Ngày";
    skinText.textContent = skins[state.skinIndex].name;
    dayNightBtn.setAttribute("aria-pressed", state.mode === "night" ? "true" : "false");
    dayNightBtn.querySelector(".icon__glyph").textContent = state.mode === "night" ? "🌙" : "☀️";
    soundBtn.setAttribute("aria-pressed", state.soundOn ? "true" : "false");
    soundBtn.querySelector(".icon__glyph").textContent = state.soundOn ? "🔊" : "🔇";
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    state.w = w;
    state.h = h;

    bird.x = Math.round(w * 0.33);
    bird.r = clamp(Math.round(Math.min(w, h) * 0.028), 12, 18);

    if (state.phase === "menu") {
      bird.y = h * 0.45;
      bird.vy = 0;
    }
  }

  function resetRun() {
    state.score = 0;
    state.difficulty = 0;
    state.speed = 170;
    state.gap = clamp(Math.round(state.h * 0.22), 120, 170);
    state.shakeT = 0;

    bird.y = state.h * 0.45;
    bird.vy = 0;
    bird.rot = 0;

    pipes.length = 0;
    particles.length = 0;

    bg.cloudX = 0;
    bg.hillX = 0;
    bg.groundX = 0;

    spawnPipe(state.w + 90);
    spawnPipe(state.w + 90 + pipeSpacing());

    scoreText.textContent = "0";
    scoreTextOver.textContent = "0";
    bestText.textContent = String(state.best);
    bestTextMenu.textContent = String(state.best);
    bestTextOver.textContent = String(state.best);
  }

  function pipeSpacing() {
    return clamp(Math.round(280 - state.difficulty * 14), 200, 280);
  }

  function applyDifficulty() {
    state.difficulty = Math.floor(state.score / 5);
    const speedBase = 170;
    const speedMax = 290;
    state.speed = clamp(speedBase + state.difficulty * 12, speedBase, speedMax);

    const gapBase = clamp(Math.round(state.h * 0.22), 120, 170);
    state.gap = clamp(gapBase - state.difficulty * 6, 102, gapBase);
  }

  function spawnPipe(x) {
    const margin = 64;
    const gap = state.gap;
    const yMin = margin + gap * 0.5;
    const yMax = state.h - margin - gap * 0.5 - groundHeight();
    const gapY = clamp(rand(yMin, yMax), yMin, yMax);
    pipes.push({
      x,
      w: clamp(Math.round(state.w * 0.14), 48, 70),
      gapY,
      gap,
      passed: false
    });
  }

  function groundHeight() {
    return clamp(Math.round(state.h * 0.12), 70, 96);
  }

  function flap() {
    if (state.phase === "menu") {
      startGame();
      return;
    }

    if (state.phase === "gameover") {
      restart();
      return;
    }

    if (state.phase !== "playing") return;
    bird.vy = -320;
    state.hintT = 0;
    sfxFlap();
  }

  function startGame() {
    if (state.phase === "playing") return;
    hideMenu();
    hideGameOver();
    state.phase = "playing";
    resetRun();
    state.hintT = 0;
  }

  function restart() {
    hideGameOver();
    state.phase = "playing";
    resetRun();
  }

  function toMenu() {
    hideGameOver();
    state.phase = "menu";
    menuOverlay.classList.add("is-visible");
    menuOverlay.setAttribute("aria-hidden", "false");
    resetRun();
    state.hintT = 0;
  }

  function gameOver() {
    if (state.phase !== "playing") return;
    state.phase = "gameover";

    if (state.score > state.best) {
      state.best = state.score;
      saveSettings();
    }

    scoreTextOver.textContent = String(state.score);
    bestTextOver.textContent = String(state.best);
    bestText.textContent = String(state.best);
    bestTextMenu.textContent = String(state.best);
    showGameOver();
    sfxCrash();
  }

  function showGameOver() {
    gameOverOverlay.classList.add("is-visible");
    gameOverOverlay.setAttribute("aria-hidden", "false");
  }

  function hideGameOver() {
    gameOverOverlay.classList.remove("is-visible");
    gameOverOverlay.setAttribute("aria-hidden", "true");
  }

  function hideMenu() {
    menuOverlay.classList.remove("is-visible");
    menuOverlay.setAttribute("aria-hidden", "true");
    howBox.classList.add("is-hidden");
  }

  function toggleMode() {
    state.mode = state.mode === "night" ? "day" : "night";
    applyUiFromState();
    saveSettings();
  }

  function nextSkin() {
    state.skinIndex = (state.skinIndex + 1) % skins.length;
    applyUiFromState();
    saveSettings();
  }

  function toggleSound() {
    state.soundOn = !state.soundOn;
    if (audio) audio.enabled = state.soundOn;
    applyUiFromState();
    saveSettings();
  }

  function addScore() {
    state.score += 1;
    applyDifficulty();
    scoreText.textContent = String(state.score);
    scoreTextOver.textContent = String(state.score);
    if (state.score > state.best) {
      state.best = state.score;
      bestText.textContent = String(state.best);
      bestTextMenu.textContent = String(state.best);
      bestTextOver.textContent = String(state.best);
      saveSettings();
    }
    spawnScoreParticles();
    sfxScore();
  }

  function spawnScoreParticles() {
    const count = 18;
    const base = skins[state.skinIndex];
    for (let i = 0; i < count; i += 1) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(90, 260);
      particles.push({
        x: bird.x + bird.r * 0.6,
        y: bird.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 40,
        r: rand(1.4, 3.2),
        life: rand(0.35, 0.6),
        t: 0,
        col: i % 2 === 0 ? base.body : base.beak
      });
    }
  }

  function collideCircleRect(cx, cy, cr, rx, ry, rw, rh) {
    const nx = clamp(cx, rx, rx + rw);
    const ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy <= cr * cr;
  }

  function triggerShake() {
    state.shakeT = 0.28;
    gameRoot.classList.remove("is-shaking");
    void gameRoot.offsetWidth;
    gameRoot.classList.add("is-shaking");
  }

  function update(dt) {
    state.dt = dt;
    state.t += dt;

    if (state.phase === "menu") {
      const float = Math.sin(state.t * 2.2) * 10;
      bird.y = state.h * 0.45 + float;
      bird.rot = Math.sin(state.t * 2.2) * 0.12;
      updateBackground(dt, 0.65);
      updateParticles(dt);
      updateHint(dt, true);
      return;
    }

    updateBackground(dt, 1);
    updateParticles(dt);
    updateHint(dt, false);

    if (state.phase !== "playing") return;

    bird.vy = clamp(bird.vy + 920 * dt, -500, 620);
    bird.y += bird.vy * dt;
    bird.rot = lerp(bird.rot, clamp(bird.vy / 520, -0.55, 1.05), 0.12);

    const gh = groundHeight();
    if (bird.y - bird.r < 0) {
      bird.y = bird.r;
      bird.vy = 0;
    }
    if (bird.y + bird.r > state.h - gh) {
      bird.y = state.h - gh - bird.r;
      triggerShake();
      gameOver();
      return;
    }

    const sp = state.speed;
    for (let i = 0; i < pipes.length; i += 1) {
      pipes[i].x -= sp * dt;
    }

    while (pipes.length && pipes[0].x + pipes[0].w < -30) {
      pipes.shift();
    }

    if (pipes.length) {
      const last = pipes[pipes.length - 1];
      if (last.x < state.w - pipeSpacing()) {
        spawnPipe(state.w + 40);
      }
    }

    for (let i = 0; i < pipes.length; i += 1) {
      const p = pipes[i];
      if (!p.passed && p.x + p.w < bird.x - bird.r) {
        p.passed = true;
        addScore();
      }

      const topH = p.gapY - p.gap / 2;
      const botY = p.gapY + p.gap / 2;
      const botH = state.h - botY - gh;

      const hitTop = collideCircleRect(bird.x, bird.y, bird.r, p.x, 0, p.w, topH);
      const hitBot = collideCircleRect(bird.x, bird.y, bird.r, p.x, botY, p.w, botH);
      if (hitTop || hitBot) {
        triggerShake();
        gameOver();
        return;
      }
    }
  }

  function updateBackground(dt, mul) {
    const sp = state.speed * mul;
    bg.cloudX = (bg.cloudX + sp * 0.12 * dt) % state.w;
    bg.hillX = (bg.hillX + sp * 0.24 * dt) % state.w;
    bg.groundX = (bg.groundX + sp * 0.8 * dt) % state.w;
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.t += dt;
      p.vy += 820 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.22, dt);
      if (p.t >= p.life) particles.splice(i, 1);
    }
  }

  function updateHint(dt, show) {
    state.hintT += dt;
    if (state.phase === "playing" && state.score === 0 && state.hintT < 4.0) {
      tapHint.classList.add("is-visible");
      tapHint.textContent = "Chạm / Click / SPACE để bay";
      return;
    }
    if (show && state.hintT < 3.0) {
      tapHint.classList.add("is-visible");
      tapHint.textContent = "Chạm / Click / SPACE để bay";
      return;
    }
    tapHint.classList.remove("is-visible");
  }

  function render() {
    ctx.clearRect(0, 0, state.w, state.h);
    drawBackground();
    drawPipes();
    drawParticles();
    drawBird();
    drawGround();

    if (state.phase === "menu") {
      drawCenterPrompt();
    }
  }

  function drawBackground() {
    const w = state.w;
    const h = state.h;
    const gh = groundHeight();

    const isNight = state.mode === "night";
    const g = ctx.createLinearGradient(0, 0, 0, h);
    if (isNight) {
      g.addColorStop(0, "#091028");
      g.addColorStop(0.5, "#070a14");
      g.addColorStop(1, "#05060b");
    } else {
      g.addColorStop(0, "#49b6ff");
      g.addColorStop(0.55, "#1974ff");
      g.addColorStop(1, "#0b2b6a");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (isNight) {
      for (let i = 0; i < bg.starSeed.length; i += 1) {
        const s = bg.starSeed[i];
        const x = (s.x * w + bg.cloudX * 0.18) % w;
        const y = s.y * (h - gh) * 0.58 + 10;
        ctx.globalAlpha = s.a;
        ctx.fillStyle = "#e9f2ff";
        ctx.fillRect(x, y, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    } else {
      drawCloudLayer();
    }

    drawHills();
  }

  function drawCloudLayer() {
    const w = state.w;
    const h = state.h;
    const gh = groundHeight();
    const y = (h - gh) * 0.18;
    const x0 = -bg.cloudX;

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    for (let i = 0; i < 6; i += 1) {
      const x = x0 + i * (w * 0.38);
      drawCloud(x, y + (i % 2) * 16, 1.0 + (i % 3) * 0.08);
    }
    ctx.globalAlpha = 1;
  }

  function drawCloud(x, y, s) {
    ctx.beginPath();
    ctx.ellipse(x + 40 * s, y + 12 * s, 34 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 64 * s, y + 6 * s, 24 * s, 14 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 22 * s, y + 8 * s, 20 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 48 * s, y + 20 * s, 44 * s, 18 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHills() {
    const w = state.w;
    const h = state.h;
    const gh = groundHeight();
    const baseY = h - gh;
    const isNight = state.mode === "night";

    const x0 = -bg.hillX;
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = isNight ? "rgba(28, 44, 88, 0.55)" : "rgba(15, 120, 95, 0.55)";
    for (let i = 0; i < 4; i += 1) {
      const x = x0 + i * (w * 0.55);
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.quadraticCurveTo(x + w * 0.22, baseY - h * 0.16, x + w * 0.44, baseY);
      ctx.quadraticCurveTo(x + w * 0.52, baseY + 20, x + w * 0.55, baseY);
      ctx.lineTo(x + w * 0.55, baseY + 40);
      ctx.lineTo(x, baseY + 40);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGround() {
    const w = state.w;
    const h = state.h;
    const gh = groundHeight();
    const y = h - gh;
    const isNight = state.mode === "night";

    const g = ctx.createLinearGradient(0, y, 0, h);
    if (isNight) {
      g.addColorStop(0, "#0a0f1d");
      g.addColorStop(1, "#070a12");
    } else {
      g.addColorStop(0, "#2b1d12");
      g.addColorStop(1, "#1a120b");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, gh);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    const stripeW = 42;
    const x0 = -bg.groundX;
    for (let i = 0; i < Math.ceil(w / stripeW) + 2; i += 1) {
      const x = x0 + i * stripeW;
      ctx.fillRect(x, y + 10, stripeW * 0.5, 3);
    }

    ctx.fillStyle = isNight ? "rgba(120, 180, 255, 0.16)" : "rgba(120, 255, 210, 0.16)";
    ctx.fillRect(0, y, w, 2);
  }

  function drawPipes() {
    const w = state.w;
    const h = state.h;
    const gh = groundHeight();
    const isNight = state.mode === "night";

    for (let i = 0; i < pipes.length; i += 1) {
      const p = pipes[i];
      const topH = p.gapY - p.gap / 2;
      const botY = p.gapY + p.gap / 2;
      const botH = h - botY - gh;

      drawPipe(p.x, 0, p.w, topH, isNight, true);
      drawPipe(p.x, botY, p.w, botH, isNight, false);
    }
  }

  function drawPipe(x, y, w, h, isNight, isTop) {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    if (isNight) {
      grad.addColorStop(0, "#2bffb5");
      grad.addColorStop(0.55, "#00c98c");
      grad.addColorStop(1, "#2bffb5");
    } else {
      grad.addColorStop(0, "#48f1b6");
      grad.addColorStop(0.55, "#12c987");
      grad.addColorStop(1, "#48f1b6");
    }
    ctx.fillStyle = grad;
    roundRect(x, y, w, h, 10);
    ctx.fill();

    ctx.globalAlpha = 0.16;
    ctx.fillStyle = "#000000";
    ctx.fillRect(x + w * 0.66, y, w * 0.12, h);
    ctx.globalAlpha = 1;

    const capH = 18;
    const capW = w + 10;
    const capX = x - 5;
    const capY = isTop ? y + h - capH : y;
    ctx.fillStyle = isNight ? "rgba(0,0,0,0.14)" : "rgba(0,0,0,0.12)";
    roundRect(capX, capY, capW, capH, 10);
    ctx.fill();

    ctx.globalAlpha = 0.26;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 10);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawBird() {
    const s = skins[state.skinIndex];
    const x = bird.x;
    const y = bird.y;
    const r = bird.r;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(bird.rot);

    ctx.fillStyle = s.outline;
    ctx.beginPath();
    ctx.ellipse(2, 2, r * 1.1, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.1, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.belly;
    ctx.beginPath();
    ctx.ellipse(-r * 0.15, r * 0.16, r * 0.74, r * 0.58, 0.12, 0, Math.PI * 2);
    ctx.fill();

    const flapPhase = state.phase === "playing" ? clamp(-bird.vy / 520, 0, 1) : 0.5;
    const wingY = lerp(r * 0.38, -r * 0.18, flapPhase);
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, wingY, r * 0.65, r * 0.38, -0.65, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0b1020";
    ctx.beginPath();
    ctx.arc(r * 0.32, -r * 0.16, r * 0.16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(r * 0.36, -r * 0.2, r * 0.06, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.beak;
    ctx.beginPath();
    ctx.moveTo(r * 0.92, r * 0.02);
    ctx.lineTo(r * 1.5, r * 0.18);
    ctx.lineTo(r * 0.92, r * 0.32);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i += 1) {
      const p = particles[i];
      const a = 1 - p.t / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.col;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCenterPrompt() {
    const text = "Nhấn Bắt đầu hoặc SPACE";
    ctx.save();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.font = "700 14px ui-sans-serif, system-ui";
    const m = ctx.measureText(text);
    const x = (state.w - m.width) * 0.5;
    const y = state.h * 0.66;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function tick(now) {
    const t = now * 0.001;
    const dt = clamp(t - (state._lastT || t), 0, 0.032);
    state._lastT = t;

    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  function shouldIgnoreTap(target) {
    if (!target) return false;
    if (target.closest && target.closest("button")) return true;
    if (target.closest && target.closest("a")) return true;
    if (state.phase === "menu" && target.closest && target.closest(".panel")) return true;
    if (state.phase === "gameover" && target.closest && target.closest(".panel")) return true;
    return false;
  }

  function ensureAudioFromGesture() {
    if (!audio) {
      audio = createAudio();
      if (audio) audio.enabled = state.soundOn;
    } else {
      audio.ensureRunning && audio.ensureRunning();
    }
  }

  function onPointer(e) {
    if (shouldIgnoreTap(e.target)) return;
    e.preventDefault();
    ensureAudioFromGesture();
    flap();
  }

  function onTouch(e) {
    if (shouldIgnoreTap(e.target)) return;
    e.preventDefault();
    ensureAudioFromGesture();
    flap();
  }

  function onKeyDown(e) {
    if (e.code === "Space") {
      e.preventDefault();
      ensureAudioFromGesture();
      flap();
      return;
    }
  }

  function wireUi() {
    gameRoot.addEventListener("pointerdown", onPointer, { passive: false });
    gameRoot.addEventListener("touchstart", onTouch, { passive: false });

    startBtn.addEventListener("click", () => {
      if (!audio) {
        audio = createAudio();
        if (audio) audio.enabled = state.soundOn;
      } else {
        audio.ensureRunning && audio.ensureRunning();
      }
      startGame();
    });

    restartBtn.addEventListener("click", () => {
      if (!audio) {
        audio = createAudio();
        if (audio) audio.enabled = state.soundOn;
      } else {
        audio.ensureRunning && audio.ensureRunning();
      }
      restart();
    });

    menuBtn.addEventListener("click", () => toMenu());

    howBtn.addEventListener("click", () => {
      howBox.classList.toggle("is-hidden");
    });

    soundBtn.addEventListener("click", () => {
      if (!audio) audio = createAudio();
      if (audio) audio.enabled = state.soundOn;
      toggleSound();
    });

    dayNightBtn.addEventListener("click", () => toggleMode());
    skinBtn.addEventListener("click", () => nextSkin());

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
  }

  loadSettings();
  applyUiFromState();
  wireUi();
  resize();
  resetRun();

  menuOverlay.classList.add("is-visible");
  menuOverlay.setAttribute("aria-hidden", "false");
  hideGameOver();

  requestAnimationFrame(tick);
})();
