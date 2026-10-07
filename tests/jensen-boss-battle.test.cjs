const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Run the real controller with deterministic frames and a minimal DOM/canvas surface.
function createGame({ accepted = true, mobile = false, home = true } = {}) {
  class Element {
    constructor(tagName = 'DIV') {
      this.tagName = tagName;
      this.style = { setProperty() {} };
      this.dataset = {};
      this.attributes = {};
      this.listeners = {};
      this.children = [];
      this.hidden = false;
      this.textContent = '';
      this.offsetWidth = 200;
      this.offsetHeight = 50;
      const classes = new Set();
      this.classList = {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        contains: name => classes.has(name),
        toggle: (name, on) => on ? classes.add(name) : classes.delete(name)
      };
    }
    addEventListener(name, callback, capture = false) {
      const callbacks = this.listeners[name] ??= [];
      if (capture) callbacks.unshift(callback);
      else callbacks.push(callback);
    }
    dispatch(name, event = {}) {
      let stopped = false;
      event.stopImmediatePropagation = () => { stopped = true; };
      event.preventDefault ??= () => { event.defaultPrevented = true; };
      for (const listener of this.listeners[name] ?? []) {
        listener(event);
        if (stopped) break;
      }
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name] ?? null; }
    removeAttribute(name) { delete this.attributes[name]; }
    append(child) { this.children.push(child); }
    focus() { focused = this; }
    setPointerCapture() {}
    getBoundingClientRect() { return { left: 20, right: 58, top: 20, bottom: 58, width: 38, height: 38 }; }
    querySelectorAll() { return []; }
    closest() { return null; }
  }
  let focused;
  let frame;
  let now = 0;
  let actor;
  let battle;
  const ids = [...read('jensen-mode/index.html').matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  elements['jensen-boss-battle'].hidden = true;
  elements['jensen-battle-result'].hidden = true;
  if (!home) delete elements['jensen-boss-trigger'];
  for (const id of ['jensen-boss-trigger', 'jensen-battle-exit', 'jensen-battle-retry', 'jensen-battle-return', 'jensen-battle-shoot', 'jensen-reset']) {
    if (!elements[id]) continue;
    elements[id].tagName = 'BUTTON';
    if (id !== 'jensen-boss-trigger') elements[id].closest = () => elements['jensen-boss-battle'];
  }
  const platform = new Element();
  platform.getBoundingClientRect = () => ({ left: 150, right: 650, top: 350 - sandbox.scrollY, width: 500, height: 100 });
  platform.setAttribute('data-jensen-platform-label', 'a card');
  const context2d = new Proxy({
    beams: [],
    clearRect() { this.beams = []; },
    moveTo(x, y) { this.beamStart = { x, y }; },
    lineTo(x, y) { this.beamEnd = { x, y }; },
    stroke() { this.beams.push({ from: this.beamStart, to: this.beamEnd }); }
  }, {
    get: (target, name) => target[name] ?? (() => {})
  });
  elements['jensen-battle-canvas'].getContext = () => context2d;
  const listeners = {};
  const prompts = [];
  const nav = new Element();
  nav.getBoundingClientRect = () => ({ left: 0, right: 1024, top: 0, bottom: 120 });
  const portal = new Element('A');
  portal.closest = selector => selector === 'nav' ? nav : null;
  portal.getBoundingClientRect = () => ({ left: 700, right: 812, top: 20, bottom: 68 });
  portal.setAttribute('data-jensen-portal', 'Projects');
  portal.setAttribute('href', 'projects.html');
  const pageControls = {
    home: new Element('A'),
    social: new Element('A'),
    module: new Element('A'),
    menu: new Element('BUTTON'),
    disabledButton: new Element('BUTTON')
  };
  pageControls.home.setAttribute('href', 'index.html');
  pageControls.social.setAttribute('href', 'https://github.com/pascal-du');
  pageControls.module.setAttribute('href', 'https://catalogue.surrey.ac.uk/module');
  pageControls.module.setAttribute('tabindex', '3');
  pageControls.disabledButton.setAttribute('disabled', '');
  pageControls.disabledButton.setAttribute('aria-disabled', 'true');
  const allControls = [portal, ...Object.values(pageControls), ...Object.values(elements).filter(el => el.tagName === 'BUTTON')];
  const document = Object.assign(new Element(), {
    getElementById: id => elements[id] ?? null,
    createElement: () => new Element(),
    querySelectorAll: selector => selector.startsWith('body > section') ? [platform] : selector === 'a, button' ? allControls : [portal],
    body: Object.assign(new Element(), { scrollHeight: 1200 }),
    documentElement: { scrollHeight: 1200 }
  });
  elements['jensen-touch'].querySelectorAll = selector => selector.includes('data-jensen-tap') ? [elements['jensen-battle-shoot']] : [];
  elements['jensen-battle-shoot'].dataset.jensenTap = 'shoot';
  const sandbox = {
    document,
    innerWidth: mobile ? 390 : 1024,
    innerHeight: mobile ? 844 : 768,
    scrollX: 0,
    scrollY: 0,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: mobile }),
    performance: { now: () => now },
    requestAnimationFrame: callback => { frame = callback; },
    addEventListener: (name, callback) => { (listeners[name] ??= []).push(callback); },
    location: { assign() {} },
    confirm: message => { prompts.push(message); return accepted; }
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  if (home) {
    vm.runInContext(read('jensen-mode/boss-battle.js'), sandbox);
    const create = sandbox.createJensenBossBattle;
    sandbox.createJensenBossBattle = args => {
      actor = args;
      battle = create(args);
      return battle;
    };
  }
  vm.runInContext(read('jensen-mode/jensen-mode.js'), sandbox);
  const emit = (name, data = {}) => {
    const event = { code: '', target: {}, preventDefault() {}, repeat: false, ...data };
    for (const callback of listeners[name] ?? []) callback(event);
  };
  return {
    elements, sandbox, prompts, emit, portal, pageControls,
    get actor() { return actor; },
    get battle() { return battle; },
    get focused() { return focused; },
    get beams() { return context2d.beams; },
    click(id) { elements[id].dispatch('click'); },
    step(count) { for (let i = 0; i < count; i++) { now += 16.6667; frame(now); } }
  };
}

function aimAtBoss(game, pointerType = 'mouse') {
  const style = game.elements['jensen-boss-image'].style;
  const [, x, y] = style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/);
  game.sandbox.document.dispatch('pointermove', {
    clientX: Number(x) + parseFloat(style.width) / 2,
    clientY: Number(y) + parseFloat(style.height) / 2,
    pointerType
  });
}

test('clicking the GIF confirms before entering; cancellation preserves normal mode', () => {
  const game = createGame({ accepted: false });
  game.click('jensen-boss-trigger');
  assert.match(game.prompts[0], /start a boss battle/);
  assert.equal(game.battle.active, false);
  assert.equal(game.elements['jensen-boss-battle'].hidden, true);
  assert.equal(game.elements['jensen-score'].textContent, '1 platforms');
});

test('clicking Jensen cycles emotes, including in battle, without firing a laser', () => {
  const game = createGame();
  game.click('jensen-player');
  const firstLine = game.elements['jensen-speech'].textContent;
  assert.equal(game.elements['jensen-speech'].hidden, false);
  assert.equal(game.actor.state.emoteIndex, 0);
  game.click('jensen-player');
  assert.equal(game.actor.state.emoteIndex, 1);
  assert.notEqual(game.elements['jensen-speech'].textContent, firstLine);
  game.click('jensen-boss-trigger');
  game.step(100);
  const player = game.elements['jensen-player'];
  player.closest = selector => selector.includes('#jensen-player') ? player : null;
  game.sandbox.document.dispatch('pointerdown', {
    button: 0, target: player, pointerType: 'mouse', clientX: 200, clientY: 300
  });
  game.click('jensen-player');
  game.step(1);
  assert.equal(game.elements['jensen-speech'].hidden, false);
  assert.ok(game.actor.state.emoteTimer > 0);
  assert.equal(game.beams.length, 0);
});

test('the GIF enlarges and moves while Jensen stays on the existing portfolio card', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  assert.equal(game.battle.active, true);
  assert.equal(game.elements['jensen-boss-image'].style.width, '38px');
  const support = game.actor.state.support;
  const y = game.actor.state.y;
  game.step(100);
  assert.ok(parseFloat(game.elements['jensen-boss-image'].style.width) > 150);
  const position = game.elements['jensen-boss-image'].style.transform;
  game.step(80);
  assert.notEqual(game.elements['jensen-boss-image'].style.transform, position);
  assert.equal(game.actor.state.support, support);
  assert.equal(game.actor.state.y, y);
  game.sandbox.scrollY = 123;
  game.step(1);
  assert.equal(game.actor.state.y, y);
  assert.equal(game.actor.state.support, support);
});

test('a quick F tap inflicts damage even when keydown/up happen between frames', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(100);
  aimAtBoss(game);
  game.emit('keydown', { code: 'KeyF' });
  game.emit('keyup', { code: 'KeyF' });
  game.step(60);
  assert.equal(game.elements['jensen-boss-health'].value, 980);
});

test('repeated shooting taps enter phase II and can defeat the boss', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  let phaseTwo = false;
  // Move around the page to dodge while the actual encounter simulates all bullets.
  for (let i = 0; i < 2400 && !game.battle.finished; i++) {
    game.actor.state.x = 450 + Math.sin(i / 45) * 400;
    game.actor.state.y = 400 + Math.sin(i / 31) * 120;
    aimAtBoss(game);
    if (i % 10 === 0) {
      game.emit('keydown', { code: 'KeyF' });
      game.emit('keyup', { code: 'KeyF' });
    }
    game.battle.update(1);
    phaseTwo ||= game.elements['jensen-boss-phase'].textContent.includes('Phase II');
  }
  assert.equal(phaseTwo, true);
  assert.equal(game.battle.finished, true);
  assert.equal(game.elements['jensen-boss-health'].value, 0);
  assert.equal(game.elements['jensen-battle-result-title'].textContent, 'BOSS DEFEATED');
  assert.equal(game.elements['jensen-boss-image'].hidden, true);
});

test('enemy attacks can defeat Jensen; retry resets both health bars', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(3000);
  assert.equal(game.battle.finished, true);
  assert.equal(game.elements['jensen-battle-player-health'].value, 0);
  assert.equal(game.elements['jensen-battle-result-title'].textContent, 'YOU WERE DEFEATED');
  game.click('jensen-battle-retry');
  assert.equal(game.battle.finished, false);
  assert.equal(game.elements['jensen-boss-health'].value, 1000);
  assert.equal(game.elements['jensen-battle-player-health'].value, 100);
});

test('Escape restores the portfolio, regular physics, and GIF trigger focus', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(120);
  game.emit('keydown', { code: 'Escape' });
  game.step(1);
  assert.equal(game.battle.active, false);
  assert.equal(game.elements['jensen-boss-battle'].hidden, true);
  assert.equal(game.elements['jensen-score'].textContent, '1 platforms');
  assert.equal(game.sandbox.document.body.classList.contains('jensen-battling'), false);
  assert.equal(game.focused, game.elements['jensen-boss-trigger']);
});

test('each touch shoot tap fires once even while the button is held', () => {
  const game = createGame({ mobile: true });
  game.click('jensen-boss-trigger');
  game.step(100);
  aimAtBoss(game, 'touch');
  game.elements['jensen-battle-shoot'].dispatch('pointerdown', { pointerId: 1, preventDefault() {} });
  game.step(45);
  assert.equal(game.elements['jensen-boss-health'].value, 980);
  game.step(90);
  const health = game.elements['jensen-boss-health'].value;
  game.step(90);
  assert.equal(game.elements['jensen-boss-health'].value, health);
  assert.ok(game.actor.state.x >= 0 && game.actor.state.x <= 390);
});

test('lasers follow cursor direction, and moving the cursor redirects only new shots', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(100);
  const center = { x: game.actor.state.x + 43, y: game.actor.state.y + 42 };
  game.sandbox.document.dispatch('pointermove', { clientX: center.x - 150, clientY: center.y, pointerType: 'mouse' });
  game.emit('keydown', { code: 'KeyF' });
  game.step(1);
  assert.equal(game.beams.length, 1);
  assert.ok(game.beams[0].to.x < center.x);
  assert.ok(Math.abs(game.beams[0].to.y - center.y) < .001);
  assert.equal(game.actor.state.facing, -1);
  game.sandbox.document.dispatch('pointermove', { clientX: center.x, clientY: center.y - 150, pointerType: 'mouse' });
  game.emit('keyup', { code: 'KeyF' });
  game.emit('keydown', { code: 'KeyF' });
  game.step(11);
  assert.equal(game.beams.length, 2);
  assert.ok(game.beams[0].to.x < game.beams[0].from.x);
  assert.ok(Math.abs(game.beams[0].to.y - center.y) < .001);
  assert.ok(Math.abs(game.beams[1].to.x - center.x) < .001);
  assert.ok(game.beams[1].to.y < center.y);
});

test('click aiming accounts for scrolling without needing a preceding pointer move', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(100);
  game.sandbox.scrollY = 123;
  const center = { x: game.actor.state.x + 43, y: game.actor.state.y + 42 };
  game.sandbox.document.dispatch('pointerdown', {
    button: 0,
    clientX: center.x - 150,
    clientY: center.y - 123,
    pointerType: 'mouse',
    preventDefault() {}
  });
  game.step(1);
  assert.equal(game.beams.length, 1);
  assert.ok(game.beams[0].to.x < center.x);
  assert.ok(Math.abs(game.beams[0].to.y - center.y) < .001);
});

test('touch controls preserve the selected aim point', () => {
  const game = createGame({ mobile: true });
  game.click('jensen-boss-trigger');
  game.step(100);
  game.actor.state.x = 80;
  const center = { x: game.actor.state.x + 43, y: game.actor.state.y + 42 };
  game.sandbox.document.dispatch('pointermove', { clientX: center.x - 100, clientY: center.y, pointerType: 'touch' });
  game.sandbox.document.dispatch('pointerdown', {
    pointerType: 'touch',
    button: 0,
    clientX: 350,
    clientY: 800,
    target: { closest: () => game.elements['jensen-battle-shoot'] }
  });
  game.elements['jensen-battle-shoot'].dispatch('pointerdown', { pointerId: 1, preventDefault() {} });
  game.step(1);
  assert.ok(game.beams[0].to.x < center.x);
  assert.ok(Math.abs(game.beams[0].to.y - center.y) < .001);
});

test('holding F and keyboard auto-repeat fire only the initial shot', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(100);
  const center = { x: game.actor.state.x + 43, y: game.actor.state.y + 42 };
  game.sandbox.document.dispatch('pointermove', { clientX: center.x - 100, clientY: center.y, pointerType: 'mouse' });
  game.emit('keydown', { code: 'KeyF' });
  for (let i = 0; i < 12; i++) {
    game.emit('keydown', { code: 'KeyF', repeat: true });
    game.step(1);
    assert.equal(game.beams.length, 1);
  }
  game.emit('keyup', { code: 'KeyF' });
  game.emit('keydown', { code: 'KeyF' });
  game.step(1);
  assert.equal(game.beams.length, 2);
});

test('holding the mouse fires once, and another click fires one more shot', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(100);
  const click = {
    button: 0,
    clientX: game.actor.state.x - 100,
    clientY: game.actor.state.y + 42,
    pointerType: 'mouse',
    preventDefault() {}
  };
  game.sandbox.document.dispatch('pointerdown', click);
  game.step(12);
  assert.equal(game.beams.length, 1);
  game.sandbox.document.dispatch('pointerup');
  game.sandbox.document.dispatch('pointerdown', click);
  game.step(1);
  assert.equal(game.beams.length, 2);
});

test('rapid taps between frames each produce one shot', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  game.step(100);
  game.sandbox.document.dispatch('pointermove', {
    clientX: game.actor.state.x - 100, clientY: game.actor.state.y + 42, pointerType: 'mouse'
  });
  for (let i = 0; i < 3; i++) {
    game.emit('keydown', { code: 'KeyF' });
    game.emit('keyup', { code: 'KeyF' });
  }
  game.step(1);
  assert.equal(game.beams.length, 3);
});

test('portal clicks and touch prompts are disabled only during the battle', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  assert.equal(game.portal.getAttribute('aria-disabled'), 'true');
  let prevented = false;
  game.portal.dispatch('click', { preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  game.actor.state.x = 720;
  game.actor.state.y = 20;
  game.actor.state.grounded = false;
  game.step(1);
  assert.equal(game.prompts.length, 1);
  game.battle.stop();
  assert.equal(game.portal.getAttribute('aria-disabled'), null);
  prevented = false;
  game.portal.dispatch('click', { preventDefault() { prevented = true; } });
  assert.equal(prevented, false);
  game.actor.state.x = 720;
  game.actor.state.y = 20;
  game.actor.state.grounded = false;
  game.step(1);
  assert.match(game.prompts[1], /Visit the Projects page/);
});

test('all portfolio buttons and links are disabled, including normal and middle clicks', () => {
  const game = createGame();
  let menuClicks = 0;
  game.pageControls.menu.addEventListener('click', () => { menuClicks++; });
  game.click('jensen-boss-trigger');
  for (const el of [...Object.values(game.pageControls), game.elements['jensen-boss-trigger']]) {
    assert.equal(el.getAttribute('aria-disabled'), 'true');
    assert.equal(el.getAttribute('tabindex'), '-1');
    if (el.tagName === 'BUTTON') assert.equal(el.getAttribute('disabled'), '');
    else assert.equal(el.getAttribute('href'), null);
    for (const action of ['click', 'auxclick']) {
      const event = {};
      el.dispatch(action, event);
      assert.equal(event.defaultPrevented, true);
    }
  }
  assert.equal(menuClicks, 0);
  assert.equal(game.prompts.length, 1);
});

test('battle controls stay usable and leaving restores original page attributes', () => {
  const game = createGame();
  game.click('jensen-boss-trigger');
  for (const id of ['jensen-battle-exit', 'jensen-battle-retry', 'jensen-battle-shoot', 'jensen-reset']) {
    assert.equal(game.elements[id].getAttribute('disabled'), null);
    assert.equal(game.elements[id].getAttribute('aria-disabled'), null);
  }
  game.click('jensen-battle-retry');
  game.click('jensen-battle-exit');
  assert.equal(game.battle.active, false);
  assert.equal(game.pageControls.social.getAttribute('href'), 'https://github.com/pascal-du');
  assert.equal(game.pageControls.home.getAttribute('href'), 'index.html');
  assert.equal(game.pageControls.module.getAttribute('tabindex'), '3');
  assert.equal(game.pageControls.menu.getAttribute('disabled'), null);
  assert.equal(game.pageControls.menu.getAttribute('aria-disabled'), null);
  assert.equal(game.pageControls.disabledButton.getAttribute('disabled'), '');
  assert.equal(game.pageControls.disabledButton.getAttribute('aria-disabled'), 'true');
  const event = {};
  game.pageControls.social.dispatch('click', event);
  assert.equal(event.defaultPrevented, undefined);
});

test('other Jensen pages retain the controller without loading the home-page encounter', () => {
  const game = createGame({ home: false });
  game.step(180);
  assert.equal(game.elements['jensen-score'].textContent, '1 platforms');
  for (const page of ['projects', 'papers', 'contact']) {
    assert.doesNotMatch(read(`jensen-mode/${page}.html`), /boss-battle\.(js|css)|jensen-boss-trigger/);
  }
});
