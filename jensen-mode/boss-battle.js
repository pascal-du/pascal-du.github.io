/* Home-page encounter. Jensen's existing controller still owns movement and jumping. */
'use strict';

window.createJensenBossBattle = ({ state, keys, player, scoreText, resetPosition, width }) => {
  const trigger = document.getElementById('jensen-boss-trigger');
  if (!trigger) return null;
  const layer = document.getElementById('jensen-boss-battle');
  const canvas = document.getElementById('jensen-battle-canvas');
  const ctx = canvas.getContext('2d');
  const image = document.getElementById('jensen-boss-image');
  const bossHealth = document.getElementById('jensen-boss-health');
  const playerHealth = document.getElementById('jensen-battle-player-health');
  const bossHealthText = document.getElementById('jensen-boss-health-text');
  const playerHealthText = document.getElementById('jensen-battle-player-health-text');
  const phaseText = document.getElementById('jensen-boss-phase');
  const announcement = document.getElementById('jensen-battle-announcement');
  const result = document.getElementById('jensen-battle-result');
  const retry = document.getElementById('jensen-battle-retry');
  const exit = document.getElementById('jensen-battle-exit');
  const pageControls = [...document.querySelectorAll('a, button')]
    .filter(el => !el.closest('#jensen-boss-battle, #jensen-touch, #jensen-hud'));
  const controlAttributes = ['href', 'disabled', 'aria-disabled', 'tabindex'];
  let savedControlAttributes = [];
  const MAX_HP = 1000;
  let active = false;
  let finished = false;
  let savedState;
  let oldScore;
  let viewWidth = 0;
  let viewHeight = 0;
  let clock = 0;
  let hp = 100;
  let invulnerable = 0;
  let pendingShots = 0;
  let pointerAim = null;
  let introOrigin;
  let announcementTimer = 0;
  let shots = [];
  let enemyShots = [];
  let numbers = [];
  let boss;

  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const playerCenter = () => ({ x: state.x + width / 2, y: state.y + 42 });
  const floorTop = () => Math.max(innerHeight, document.documentElement.scrollHeight, document.body.scrollHeight) - 18;
  const bossMinY = () => scrollY + 160 + boss.size / 2;
  const bossMaxY = () => Math.max(bossMinY(), Math.min(floorTop() - boss.size / 2 - 8, scrollY + viewHeight - boss.size / 2 - 95));

  function layout() {
    viewWidth = innerWidth;
    viewHeight = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(viewWidth * dpr);
    canvas.height = Math.round(viewHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (boss) {
      boss.size = Math.max(64, Math.min(230, viewWidth * .42, viewHeight * .3));
      boss.x = clamp(boss.x, scrollX + boss.size / 2, scrollX + viewWidth - boss.size / 2);
      boss.y = clamp(boss.y, bossMinY(), bossMaxY());
    }
  }

  function announce(text, duration = 150) {
    announcement.textContent = text;
    announcementTimer = duration;
  }

  function start() {
    if (!active) {
      savedState = { ...state };
      oldScore = scoreText.textContent;
      savedControlAttributes = pageControls.map(el => ({
        el,
        attributes: controlAttributes.map(name => [name, el.getAttribute(name)])
      }));
    }
    const rect = trigger.getBoundingClientRect();
    introOrigin = { x: rect.left + rect.width / 2 + scrollX, y: rect.top + rect.height / 2 + scrollY };
    active = true;
    finished = false;
    clock = 0;
    hp = 100;
    invulnerable = 90;
    pendingShots = 0;
    shots = [];
    enemyShots = [];
    numbers = [];
    boss = { x: scrollX + innerWidth * .65, y: scrollY + innerHeight * .4, size: 200, hp: MAX_HP, phase: 1, attack: 130, charge: 290, dash: 0, vx: 0, vy: 0, flash: 0 };
    keys.clear();
    layer.hidden = false;
    result.hidden = true;
    image.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('jensen-battling');
    pageControls.forEach(el => {
      el.setAttribute('aria-disabled', 'true');
      el.setAttribute('tabindex', '-1');
      if (el.tagName === 'BUTTON') el.setAttribute('disabled', '');
      else el.removeAttribute('href');
    });
    layout();
    state.vx = state.vy = 0;
    state.facing = 1;
    state.emoteTimer = 0;
    state.jumpQueued = state.dashQueued = state.poundQueued = false;
    state.dashTimer = state.dashCooldown = 0;
    state.groundPound = false;
    scoreText.textContent = 'BOSS BATTLE';
    announce('Pascal has awoken!', 180);
    exit.focus({ preventScroll: true });
    draw();
  }

  function stop() {
    if (!active) return;
    active = false;
    finished = false;
    pendingShots = 0;
    keys.clear();
    shots = [];
    enemyShots = [];
    layer.hidden = true;
    document.body.classList.remove('jensen-battling');
    savedControlAttributes.forEach(({ el, attributes }) => {
      attributes.forEach(([name, value]) => {
        if (value === null) el.removeAttribute(name);
        else el.setAttribute(name, value);
      });
    });
    player.classList.remove('jensen-invulnerable');
    trigger.setAttribute('aria-expanded', 'false');
    Object.assign(state, savedState);
    scoreText.textContent = oldScore;
    resetPosition();
    trigger.focus({ preventScroll: true });
  }

  function finish(won) {
    finished = true;
    keys.clear();
    pendingShots = 0;
    state.vx = state.vy = 0;
    state.emoteTimer = 0;
    shots = [];
    enemyShots = [];
    player.classList.remove('jensen-invulnerable');
    image.hidden = won;
    announce(won ? 'Pascal has been defeated!' : 'Jensen was defeated.', 240);
    document.getElementById('jensen-battle-result-title').textContent = won ? 'BOSS DEFEATED' : 'YOU WERE DEFEATED';
    document.getElementById('jensen-battle-result-description').textContent = won
      ? 'GPU power prevails. The portfolio is safe… for now.'
      : 'Use the cards as platforms. Dodge the purple projectiles and dash away when Pascal glows gold.';
    result.hidden = false;
    retry.focus({ preventScroll: true });
  }

  function hurtPlayer(damage) {
    if (invulnerable > 0 || finished) return;
    hp = Math.max(0, hp - damage);
    invulnerable = 75;
    const center = playerCenter();
    numbers.push({ x: center.x, y: center.y, text: `−${damage}`, color: '#ff6f87', life: 50 });
    if (hp === 0) finish(false);
  }

  function fire() {
    const from = playerCenter();
    // Keep the cursor in viewport coordinates so scrolling does not shift the aim.
    const dx = pointerAim ? pointerAim.x + scrollX - from.x : state.facing;
    const dy = pointerAim ? pointerAim.y + scrollY - from.y : 0;
    const angle = Math.hypot(dx, dy) < .01 ? (state.facing > 0 ? 0 : Math.PI) : Math.atan2(dy, dx);
    shots.push({ x: from.x, y: from.y, vx: Math.cos(angle) * 14, vy: Math.sin(angle) * 14, life: 100 });
    if (Math.abs(dx) > .01) state.facing = dx > 0 ? 1 : -1;
    state.emoteTimer = 0;
  }

  function volley() {
    const target = playerCenter();
    const aim = Math.atan2(target.y - boss.y, target.x - boss.x);
    const count = boss.phase === 2 ? 5 : 3;
    for (let i = 0; i < count; i++) {
      const angle = aim + (i - (count - 1) / 2) * .24;
      const speed = boss.phase === 2 ? 4.1 : 3.2;
      enemyShots.push({ x: boss.x, y: boss.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 240 });
    }
  }

  // Segment/circle collision catches bullets even when a frame spans a fast projectile.
  function hitCircle(from, to, center, radius) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = dx * dx + dy * dy;
    const t = length ? clamp(((center.x - from.x) * dx + (center.y - from.y) * dy) / length, 0, 1) : 0;
    return Math.hypot(from.x + dx * t - center.x, from.y + dy * t - center.y) <= radius;
  }

  function advanceProjectiles(list, dt, collision) {
    return list.filter(shot => {
      if (finished) return false;
      const previous = { x: shot.x, y: shot.y };
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (collision(previous, shot)) return false;
      return shot.life > 0 && shot.x > scrollX - 30 && shot.x < scrollX + viewWidth + 30 && shot.y > -30 && shot.y < floorTop() + 30;
    });
  }

  function update(dt) {
    if (!active) return;
    if (viewWidth !== innerWidth || viewHeight !== innerHeight) layout();
    if (!finished) {
      clock += dt;
      invulnerable = Math.max(0, invulnerable - dt);
      boss.flash = Math.max(0, boss.flash - dt);
      if (clock >= 90) {
        while (pendingShots > 0) {
          fire();
          pendingShots--;
        }
        if (boss.hp <= MAX_HP / 2 && boss.phase === 1) {
          boss.phase = 2;
          boss.attack = Math.min(boss.attack, 35);
          boss.charge = Math.min(boss.charge, 100);
          announce('Phase II — Pascal is enraged!', 150);
        }
        boss.attack -= dt;
        boss.charge -= dt;
        if (boss.attack <= 0) {
          volley();
          boss.attack = boss.phase === 2 ? 65 : 105;
        }
        if (boss.charge <= 0) {
          const target = playerCenter();
          const angle = Math.atan2(target.y - boss.y, target.x - boss.x);
          boss.vx = Math.cos(angle) * (boss.phase === 2 ? 12 : 9);
          boss.vy = Math.sin(angle) * (boss.phase === 2 ? 12 : 9);
          boss.dash = 24;
          boss.charge = boss.phase === 2 ? 220 : 300;
        }
        if (boss.dash > 0) {
          boss.x += boss.vx * dt;
          boss.y += boss.vy * dt;
          boss.dash = Math.max(0, boss.dash - dt);
        } else if (boss.charge > 30) {
          const targetX = scrollX + viewWidth * (.5 + Math.sin(clock / 95) * .29);
          const targetY = clamp(state.y - 120 + Math.sin(clock / 63) * 40, bossMinY(), bossMaxY());
          const smoothing = 1 - Math.pow(.975, dt);
          boss.x += (targetX - boss.x) * smoothing;
          boss.y += (targetY - boss.y) * smoothing;
        }
        boss.x = clamp(boss.x, scrollX + boss.size / 2 + 8, scrollX + viewWidth - boss.size / 2 - 8);
        boss.y = clamp(boss.y, bossMinY(), bossMaxY());
        shots = advanceProjectiles(shots, dt, (from, to) => {
          if (!hitCircle(from, to, boss, boss.size * .42)) return false;
          boss.hp = Math.max(0, boss.hp - 20);
          boss.flash = 4;
          numbers.push({ x: to.x, y: to.y, text: '20', color: '#ffd477', life: 40 });
          if (boss.hp === 0) finish(true);
          return true;
        });
        enemyShots = advanceProjectiles(enemyShots, dt, (from, to) => {
          if (!hitCircle(from, to, playerCenter(), 26)) return false;
          hurtPlayer(15);
          return true;
        });
        if (Math.hypot(boss.x - playerCenter().x, boss.y - playerCenter().y) < boss.size * .38 + 24) hurtPlayer(20);
      }
    }
    announcementTimer = Math.max(0, announcementTimer - dt);
    if (announcementTimer === 0) announcement.textContent = '';
    numbers = numbers.filter(number => {
      number.y -= .7 * dt;
      number.life -= dt;
      return number.life > 0;
    });
    player.classList.toggle('jensen-invulnerable', !finished && invulnerable > 0 && Math.floor(invulnerable / 5) % 2 === 0);
    draw();
  }

  function draw() {
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    // Combat stays in document coordinates, just like Jensen and the portfolio cards.
    ctx.save();
    ctx.translate(-scrollX, -scrollY);

    for (const shot of shots) {
      ctx.strokeStyle = '#72f0b2';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(shot.x - shot.vx * 1.1, shot.y - shot.vy * 1.1);
      ctx.lineTo(shot.x, shot.y);
      ctx.stroke();
      ctx.fillStyle = '#fff5bd';
      ctx.fillRect(shot.x - 3, shot.y - 3, 6, 6);
    }
    for (const shot of enemyShots) {
      ctx.fillStyle = '#945bff';
      ctx.fillRect(shot.x - 7, shot.y - 7, 14, 14);
      ctx.fillStyle = '#e5b4ff';
      ctx.fillRect(shot.x - 3, shot.y - 3, 6, 6);
    }
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px monospace';
    for (const number of numbers) {
      ctx.globalAlpha = Math.min(1, number.life / 15);
      ctx.fillStyle = number.color;
      ctx.fillText(number.text, number.x, number.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const grow = clamp(clock / 75, 0, 1);
    const eased = 1 - Math.pow(1 - grow, 3);
    const size = 38 + (boss.size - 38) * eased;
    const x = introOrigin.x + (boss.x - introOrigin.x) * eased;
    const y = introOrigin.y + (boss.y - introOrigin.y) * eased;
    image.style.width = `${size}px`;
    image.style.height = `${size}px`;
    image.style.transform = `translate3d(${x - size / 2 - scrollX}px, ${y - size / 2 - scrollY}px, 0)`;
    image.classList.toggle('enraged', boss.phase === 2);
    image.classList.toggle('charging', boss.charge <= 30);
    image.classList.toggle('hit', boss.flash > 0);
    bossHealth.value = boss.hp;
    playerHealth.value = hp;
    bossHealthText.textContent = `${boss.hp} / ${MAX_HP}`;
    playerHealthText.textContent = `${hp} / 100`;
    phaseText.textContent = boss.phase === 2 ? 'Phase II · Enraged' : 'Phase I · Awakened';
  }

  trigger.addEventListener('click', () => {
    keys.clear();
    const accepted = window.confirm('Summon Pascal and start a boss battle?');
    keys.clear();
    if (accepted) start();
  });
  retry.addEventListener('click', start);
  exit.addEventListener('click', stop);
  document.getElementById('jensen-battle-return').addEventListener('click', stop);
  function trackAim(event) {
    // Movement and shoot buttons should not pull a touch player's aim toward the HUD.
    if (event.pointerType === 'touch' && event.target?.closest?.('a, button, input, textarea, select, form')) return;
    if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
      pointerAim = { x: event.clientX, y: event.clientY };
    }
  }
  document.addEventListener('pointermove', trackAim);
  document.addEventListener('pointerdown', event => {
    trackAim(event);
    if (!active || finished || event.button !== 0) return;
    if (event.target?.closest?.('#jensen-player, a, button, input, textarea, select, form')) return;
    event.preventDefault();
    pendingShots++;
  });
  addEventListener('blur', () => { pendingShots = 0; });
  pageControls.forEach(el => {
    const preventPageAction = event => {
      if (!active) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    el.addEventListener('click', preventPageAction, true);
    el.addEventListener('auxclick', preventPageAction, true);
  });

  return {
    get active() { return active; },
    get finished() { return active && finished; },
    start,
    stop,
    update,
    shoot: () => { if (active && !finished) pendingShots++; }
  };
};
