(() => {
  'use strict';

  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const frame = document.querySelector('#canvasFrame');
  const startOverlay = document.querySelector('#startOverlay');
  const endOverlay = document.querySelector('#endOverlay');
  const startButton = document.querySelector('#startButton');
  const retryButton = document.querySelector('#retryButton');
  const shareButton = document.querySelector('#shareButton');
  const soundButton = document.querySelector('#soundButton');
  const timeReadout = document.querySelector('#timeReadout');
  const scoreReadout = document.querySelector('#scoreReadout');
  const bestReadout = document.querySelector('#bestReadout');
  const finalTime = document.querySelector('#finalTime');
  const rankText = document.querySelector('#rankText');
  const phaseName = document.querySelector('#phaseName');
  const seedLabel = document.querySelector('#seedLabel');
  const toast = document.querySelector('#toast');

  const TAU = Math.PI * 2;
  const TOTAL = 30;
  const today = new Date().toISOString().slice(0, 10);
  const seed = [...today].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
  seedLabel.textContent = today.replaceAll('-', '.');
  document.querySelector('#dateLabel').textContent = `${today.replaceAll('-', '.')} · LIVE`; 

  let width = 0, height = 0, dpr = 1, last = 0, raf = 0;
  let state = 'ready', elapsed = 0, score = 0, soundOn = false;
  let rng, player, target, hazards, sparks, trail, keys = {};
  let pointer = { x: 0, y: 0, active: false };
  const savedBest = Number(localStorage.getItem('same30-best') || 0);
  bestReadout.textContent = savedBest.toFixed(1).padStart(4, '0');

  function random() { rng = (rng * 1664525 + 1013904223) >>> 0; return rng / 4294967296; }
  function resize() {
    const rect = frame.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width; height = rect.height;
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (state !== 'running') drawIdle();
  }
  function reset() {
    rng = seed; elapsed = 0; score = 0; hazards = []; sparks = []; trail = [];
    player = { x: width / 2, y: height / 2, r: 7, vx: 0, vy: 0 };
    target = makeTarget();
    for (let i = 0; i < 5; i++) addHazard(true);
    timeReadout.textContent = '00.0'; scoreReadout.textContent = '000'; phaseName.textContent = 'WARM UP';
  }
  function makeTarget() { return { x: 34 + random() * (width - 68), y: 34 + random() * (height - 68), r: 8, pulse: random() * TAU }; }
  function addHazard(still = false) {
    const side = Math.floor(random() * 4), pad = 26;
    const x = side === 0 ? -pad : side === 1 ? width + pad : random() * width;
    const y = side === 2 ? -pad : side === 3 ? height + pad : random() * height;
    const angle = Math.atan2(height / 2 - y, width / 2 - x) + (random() - .5) * 1.4;
    hazards.push({ x, y, r: 4 + random() * 3, speed: (still ? 17 : 25) + random() * 18, vx: Math.cos(angle), vy: Math.sin(angle), wobble: random() * TAU });
  }
  function begin() { reset(); state = 'running'; startOverlay.classList.add('is-hidden'); endOverlay.classList.add('is-hidden'); last = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); beep(260, .04); }
  function finish() {
    state = 'ended'; const best = Math.max(savedBest, elapsed);
    if (elapsed > savedBest) localStorage.setItem('same30-best', elapsed.toFixed(2));
    bestReadout.textContent = best.toFixed(1).padStart(4, '0'); finalTime.textContent = elapsed.toFixed(1).padStart(4, '0');
    const percentile = Math.min(99, Math.max(1, Math.floor((elapsed / TOTAL) ** 1.55 * 100)));
    rankText.textContent = `BETTER THAN ${percentile}% OF PLAYERS`;
    endOverlay.classList.remove('is-hidden'); beep(110, .16); beep(220, .1); draw();
  }
  function loop(now) { const dt = Math.min((now - last) / 1000, .035); last = now; update(dt); draw(); if (state === 'running') raf = requestAnimationFrame(loop); }
  function update(dt) {
    elapsed += dt; if (elapsed >= TOTAL) { elapsed = TOTAL; finish(); return; }
    const phase = elapsed < 8 ? 0 : elapsed < 16 ? 1 : elapsed < 24 ? 2 : 3;
    phaseName.textContent = ['WARM UP', 'CROWD', 'REVERSE', 'PANIC'][phase];
    const speed = phase >= 2 && Math.floor(elapsed * 2) % 9 < 2 ? -1 : 1;
    let tx = pointer.active ? pointer.x : player.x, ty = pointer.active ? pointer.y : player.y;
    if (keys.ArrowLeft || keys.a) tx -= 90; if (keys.ArrowRight || keys.d) tx += 90; if (keys.ArrowUp || keys.w) ty -= 90; if (keys.ArrowDown || keys.s) ty += 90;
    if (phase === 2) { const cx = width / 2, cy = height / 2; const dx = tx - cx, dy = ty - cy; tx = cx - dx; ty = cy - dy; }
    player.vx += (tx - player.x) * 11 * dt * speed; player.vy += (ty - player.y) * 11 * dt * speed;
    player.vx *= Math.pow(.001, dt); player.vy *= Math.pow(.001, dt); player.x += player.vx * dt; player.y += player.vy * dt;
    player.x = Math.max(12, Math.min(width - 12, player.x)); player.y = Math.max(12, Math.min(height - 12, player.y));
    trail.push({ x: player.x, y: player.y, life: 1 }); if (trail.length > 60) trail.shift();
    if (elapsed > 4 && hazards.length < 13 && random() < dt * (phase + .8)) addHazard();
    hazards.forEach(h => { h.x += h.vx * h.speed * dt * (1 + elapsed / 45); h.y += h.vy * h.speed * dt * (1 + elapsed / 45); h.wobble += dt * 3; });
    hazards = hazards.filter(h => h.x > -60 && h.x < width + 60 && h.y > -60 && h.y < height + 60);
    if (Math.hypot(player.x - target.x, player.y - target.y) < player.r + target.r + 5) { score++; sparks.push(...burst(target.x, target.y)); target = makeTarget(); beep(540 + score * 18, .035); }
    if (hazards.some(h => Math.hypot(player.x - h.x, player.y - h.y) < player.r + h.r + (phase === 3 ? 3 : 0))) { elapsed = Math.max(0, elapsed - .35); player.vx *= -.8; player.vy *= -.8; sparks.push(...burst(player.x, player.y, true)); beep(85, .08); }
    timeReadout.textContent = elapsed.toFixed(1).padStart(4, '0'); scoreReadout.textContent = String(score).padStart(3, '0');
    sparks.forEach(s => { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 2.2; }); sparks = sparks.filter(s => s.life > 0);
  }
  function burst(x, y, bad = false) { return Array.from({ length: 8 }, () => ({ x, y, vx: (random() - .5) * 100, vy: (random() - .5) * 100, life: 1, bad })); }
  function drawIdle() { reset(); draw(); }
  function draw() {
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = '#0b0c0f'; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.globalAlpha = .22; ctx.strokeStyle = '#303239'; ctx.lineWidth = 1;
    for (let x = 22; x < width; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
    for (let y = 22; y < height; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); } ctx.restore();
    if (!player) return;
    trail.forEach((p, i) => { ctx.globalAlpha = (i / trail.length) * .26; ctx.fillStyle = '#d9f56a'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, TAU); ctx.fill(); }); ctx.globalAlpha = 1;
    const pulse = 1 + Math.sin(performance.now() / 240 + target.pulse) * .14;
    ctx.shadowBlur = 18; ctx.shadowColor = '#d9f56a'; ctx.fillStyle = '#d9f56a'; ctx.beginPath(); ctx.arc(target.x, target.y, target.r * pulse, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    hazards.forEach(h => { ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.wobble); ctx.strokeStyle = '#ff795d'; ctx.lineWidth = 2; ctx.globalAlpha = .85; ctx.beginPath(); ctx.moveTo(-h.r, -h.r); ctx.lineTo(h.r, h.r); ctx.moveTo(h.r, -h.r); ctx.lineTo(-h.r, h.r); ctx.stroke(); ctx.restore(); });
    sparks.forEach(s => { ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.bad ? '#ff795d' : '#d9f56a'; ctx.fillRect(s.x, s.y, 2, 2); }); ctx.globalAlpha = 1;
    ctx.shadowBlur = 15; ctx.shadowColor = '#f1f0ec'; ctx.fillStyle = '#f1f0ec'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, TAU); ctx.fill(); ctx.shadowBlur = 0;
    if (state === 'running' && elapsed > 24) { ctx.strokeStyle = 'rgba(255,121,93,.32)'; ctx.lineWidth = 2; ctx.strokeRect(10, 10, width - 20, height - 20); }
  }
  function setPointer(e) { const r = canvas.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; pointer.active = true; }
  function beep(freq, duration) { if (!soundOn) return; const ac = window.audioContext || (window.audioContext = new AudioContext()); const osc = ac.createOscillator(), gain = ac.createGain(); osc.frequency.value = freq; osc.type = 'sine'; gain.gain.setValueAtTime(.035, ac.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ac.currentTime + duration); osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime + duration); }
  function showToast(text) { toast.textContent = text; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 1800); }
  startButton.addEventListener('click', begin); retryButton.addEventListener('click', begin);
  canvas.addEventListener('pointermove', setPointer); canvas.addEventListener('pointerdown', e => { setPointer(e); if (state !== 'running') begin(); });
  window.addEventListener('keydown', e => { keys[e.key] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault(); if (e.key === ' ' && state !== 'running') begin(); });
  window.addEventListener('keyup', e => { keys[e.key] = false; });
  soundButton.addEventListener('click', () => { soundOn = !soundOn; soundButton.textContent = soundOn ? '◖' : '⌁'; soundButton.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on'); if (soundOn) beep(440, .06); });
  async function copyResult(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const input = document.createElement('textarea');
    input.value = text; input.setAttribute('readonly', '');
    input.style.position = 'fixed'; input.style.opacity = '0';
    document.body.appendChild(input); input.select();
    const copied = document.execCommand('copy'); input.remove();
    if (!copied) throw new Error('Clipboard unavailable');
    return true;
  }
  shareButton.addEventListener('click', async () => {
    const text = `I survived ${elapsed.toFixed(1)} seconds on SAME 30. Can you beat me? ${location.href}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SAME 30', text, url: location.href });
        showToast('RESULT SHARED');
      } else {
        await copyResult(text); showToast('RESULT COPIED');
      }
    } catch (error) {
      if (error.name === 'AbortError') return;
      try { await copyResult(text); showToast('RESULT COPIED'); }
      catch (_) { showToast('COPY FAILED — TRY AGAIN'); }
    }
  });
  window.addEventListener('resize', resize); resize();
})();
