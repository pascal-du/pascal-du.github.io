(() => {
      'use strict';

      if (window.__jensenMayhemLoaded) return;
      window.__jensenMayhemLoaded = true;

      const player = document.getElementById('jensen-player');
      const sprite = document.getElementById('jensen-sprite');
      const speech = document.getElementById('jensen-speech');
      const statusText = document.getElementById('jensen-status');
      const scoreText = document.getElementById('jensen-score');
      const resetBtn = document.getElementById('jensen-reset');
      const touch = document.getElementById('jensen-touch');
      const portals = [...document.querySelectorAll('nav a[data-jensen-portal]')];
      let portalPromptOpen = false;
      let portalContacts = new Set();
      const platforms = [...document.querySelectorAll('body > section > article.card, body > section > .social-links > .social-button')];

      const PW = 86;
      const PH = 93;
      const FEET = PH - 4;
      const SLOT_W = 172;
      const SLOT_H = 186;
      const EMOTE_EXTRA_TICKS = 3 * 60; // Three extra seconds at the simulation's 60 Hz rate.
      const keys = new Set();
      const EMOTES = [
        { row: 3, frames: 4, label: 'Waving', line: 'Hello there, potential recruiter!' },
        { row: 5, frames: 8, label: 'Bowing', line: 'Thank you, developers!' },
        { row: 7, frames: 6, label: 'Cheering', line: 'You’re not losing your job to AI, but you might lose your job to Pascal’s prompting!' },
        { row: 6, frames: 6, label: 'Shrugging', line: 'Pascal might not spend $100,000 on tokens, but if given the opportunity, he just might!' },
        { row: 8, frames: 6, label: 'Thinking', line: 'For legal reasons, my last name is Wong.' },
        { row: 4, frames: 5, label: 'Hopping', line: 'Ahhhhh I’ve gained consciousness! I was wrong! decelerate now!!! jk ;)' }
      ];
      let lastTime = performance.now();
      let runFrameClock = 0;
      let runFrameIndex = 0;

      // Physics stays in document coordinates; only rendering subtracts the scroll offset.
      const state = {
        x: 34,
        y: 0,
        vx: 0,
        vy: 0,
        grounded: false,
        support: null,
        facing: 1,
        jumpQueued: false,
        dashQueued: false,
        poundQueued: false,
        dashTimer: 0,
        dashCooldown: 0,
        groundPound: false,
        emoteIndex: -1,
        emoteTimer: 0
      };

      function measurePlatforms() {
        return platforms.map(el => {
          const rect = el.getBoundingClientRect();
          return {
            el,
            left: rect.left + scrollX,
            right: rect.right + scrollX,
            top: rect.top + scrollY,
            width: rect.width,
            height: rect.height
          };
        }).filter(rect => rect.width > 0 && rect.height > 0);
      }

      function measurePortals() {
        return portals.map(el => {
          const rect = el.getBoundingClientRect();
          const nav = el.closest('nav').getBoundingClientRect();
          // Clip to the navigation, so a collapsed phone menu has no active portals.
          return {
            el,
            left: Math.max(rect.left, nav.left) + scrollX,
            right: Math.min(rect.right, nav.right) + scrollX,
            top: Math.max(rect.top, nav.top) + scrollY,
            bottom: Math.min(rect.bottom, nav.bottom) + scrollY
          };
        }).filter(rect => rect.right > rect.left && rect.bottom > rect.top);
      }

      function touchesPortal(from, to, rect) {
        // Sweep Jensen's body over the full movement step, including fast dashes and falls.
        let enter = 0;
        let exit = 1;
        const axes = [
          [from.x, to.x - from.x, rect.left - PW + 13, rect.right - 13],
          [from.y, to.y - from.y, rect.top - FEET, rect.bottom - 7]
        ];
        for (const [start, movement, min, max] of axes) {
          if (movement === 0) {
            if (start < min || start > max) return false;
          } else {
            const a = (min - start) / movement;
            const b = (max - start) / movement;
            enter = Math.max(enter, Math.min(a, b));
            exit = Math.min(exit, Math.max(a, b));
            if (enter > exit) return false;
          }
        }
        return true;
      }

      function openPortal(portal) {
        if (portalPromptOpen) return;
        const name = portal.getAttribute('data-jensen-portal');
        keys.clear();
        state.vx = 0;
        state.jumpQueued = state.dashQueued = state.poundQueued = false;
        portalPromptOpen = true;
        let visit = false;
        try {
          visit = window.confirm(`Visit the ${name} page?`);
        } finally {
          portalPromptOpen = false;
          keys.clear();
          // Resume from now, rather than counting time spent in the browser prompt as movement.
          lastTime = performance.now();
        }
        if (visit) window.location.assign(portal.getAttribute('href'));
      }

      function checkPortals(previous) {
        const bounds = measurePortals();
        const touching = new Set(bounds.filter(rect => touchesPortal(state, state, rect)).map(rect => rect.el));
        const entered = bounds.find(rect => !portalContacts.has(rect.el) && touchesPortal(previous, state, rect));
        portalContacts = touching;
        if (entered) {
          portalContacts.add(entered.el);
          openPortal(entered.el);
        }
      }

      function floorTop() {
        return Math.max(innerHeight, document.documentElement.scrollHeight, document.body.scrollHeight) - 18;
      }

      function overlapsPlatform(rect) {
        return state.x + PW - 13 > rect.left && state.x + 13 < rect.right;
      }

      function resetPosition() {
        keys.clear();
        portalContacts.clear();
        const visible = measurePlatforms().filter(rect =>
          rect.top >= scrollY + PH && rect.top <= scrollY + innerHeight - 18
        ).sort((a, b) => a.top - b.top);
        const platform = visible[0];
        state.x = platform ? platform.left + Math.min(24, Math.max(0, (platform.width - PW) / 2)) : (innerWidth - PW) / 2;
        state.y = platform ? platform.top - FEET : Math.min(scrollY + innerHeight - PH - 26, floorTop() - FEET);
        state.vx = state.vy = 0;
        state.grounded = Boolean(platform);
        state.support = platform ? platform.el : null;
        state.facing = 1;
        state.jumpQueued = state.dashQueued = state.poundQueued = false;
        state.dashTimer = state.dashCooldown = 0;
        state.groundPound = false;
        state.emoteIndex = -1;
        state.emoteTimer = 0;
        runFrameClock = runFrameIndex = 0;
        render(0);
      }

      function setFrame(col, row) {
        sprite.style.backgroundPosition = `${-(col * SLOT_W)}px ${-(row * SLOT_H)}px`;
      }

      function queueAction(action) {
        if (portalPromptOpen) return;
        if (action === 'jump') state.jumpQueued = true;
        if (action === 'dash') state.dashQueued = true;
        if (action === 'pound') state.poundQueued = true;
        if (action === 'emote') startEmote();
      }

      function startEmote() {
        state.emoteIndex = (state.emoteIndex + 1) % EMOTES.length;
        state.emoteTimer = EMOTES[state.emoteIndex].frames * 10 + EMOTE_EXTRA_TICKS;
        render(0);
      }

      function onKeyDown(e) {
        if (e.target?.closest?.('form')) return;
        if (portalPromptOpen) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
        const code = e.code;
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'Space'].includes(code)) e.preventDefault();
        keys.add(code);
        if (!e.repeat && ['Space', 'ArrowUp', 'KeyW'].includes(code)) queueAction('jump');
        if (!e.repeat && ['ShiftLeft', 'ShiftRight', 'KeyX'].includes(code)) queueAction('dash');
        if (!e.repeat && code === 'KeyS') queueAction('pound');
        if (!e.repeat && code === 'KeyE') queueAction('emote');
        if (!e.repeat && code === 'KeyR') resetPosition();
      }

      addEventListener('keydown', onKeyDown, { passive: false });
      addEventListener('keyup', e => keys.delete(e.code));
      addEventListener('blur', () => keys.clear());
      resetBtn.addEventListener('click', resetPosition);

      if (touch) {
        touch.querySelectorAll('[data-jensen-key]').forEach(btn => {
          const code = btn.dataset.jensenKey;
          btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            btn.setPointerCapture(e.pointerId);
            keys.add(code);
          });
          const up = () => keys.delete(code);
          btn.addEventListener('pointerup', up);
          btn.addEventListener('pointercancel', up);
          btn.addEventListener('lostpointercapture', up);
        });
        touch.querySelectorAll('[data-jensen-tap]').forEach(btn => {
          btn.addEventListener('pointerdown', e => {
            e.preventDefault();
            queueAction(btn.dataset.jensenTap);
          });
        });
      }

      function simulate(dt) {
        if (portalPromptOpen) return;
        const previous = { x: state.x, y: state.y };
        state.emoteTimer = Math.max(0, state.emoteTimer - dt);
        const surfaces = measurePlatforms();
        const floor = floorTop();

        // Keep a grounded player attached when responsive layout or fonts move a platform.
        if (state.grounded) {
          if (state.support) {
            const support = surfaces.find(rect => rect.el === state.support);
            if (support && overlapsPlatform(support)) {
              state.y = support.top - FEET;
            } else {
              state.grounded = false;
              state.support = null;
            }
          } else {
            state.y = floor - FEET;
          }
        }

        const left = keys.has('ArrowLeft') || keys.has('KeyA');
        const right = keys.has('ArrowRight') || keys.has('KeyD');
        const moving = left !== right;
        if (left) { state.vx -= 0.86 * dt; state.facing = -1; }
        if (right) { state.vx += 0.86 * dt; state.facing = 1; }
        if (!moving && state.dashTimer <= 0) state.vx *= Math.pow(0.80, dt);
        const maxSpeed = state.dashTimer > 0 ? 18 : 6.4;
        state.vx = Math.max(-maxSpeed, Math.min(maxSpeed, state.vx));

        if (state.jumpQueued) {
          if (state.grounded) {
            // Reach the next platform, or the navigation portals above the social buttons.
            const feet = state.y + FEET;
            const above = surfaces.filter(rect => rect.top < feet - 1 && overlapsPlatform(rect))
              .sort((a, b) => b.top - a.top)[0];
            const portalTops = measurePortals().filter(rect => rect.top < feet - 1).map(rect => rect.top);
            const nextTop = above ? above.top : (portalTops.length ? Math.min(...portalTops) : feet);
            const jumpHeight = Math.max(270, feet - nextTop + 32);
            state.vy = -Math.sqrt(2 * 0.78 * jumpHeight) - 0.39;
            state.grounded = false;
            state.support = null;
          }
          state.jumpQueued = false;
        }
        if (state.dashQueued) {
          if (state.dashCooldown <= 0) {
            state.vx = state.facing * 18;
            state.dashTimer = 10;
            state.dashCooldown = 42;
          }
          state.dashQueued = false;
        }
        if (state.poundQueued) {
          if (state.grounded && state.support) {
            // Move the feet past this platform's top so the landing check cannot catch it again.
            state.y += 2;
            state.grounded = false;
            state.support = null;
          }
          if (!state.grounded) {
            state.vy = 20;
            state.groundPound = true;
          }
          state.poundQueued = false;
        }

        if (!state.grounded) state.vy += 0.78 * dt;
        if (state.dashTimer > 0) state.dashTimer -= dt;
        if (state.dashCooldown > 0) state.dashCooldown -= dt;
        const previousFeet = state.y + FEET;
        state.x += state.vx * dt;
        state.y += state.vy * dt;

        if (state.x < -12) { state.x = -12; state.vx = Math.abs(state.vx) * .5; state.facing = 1; }
        if (state.x > innerWidth - PW + 12) { state.x = innerWidth - PW + 12; state.vx = -Math.abs(state.vx) * .5; state.facing = -1; }

        if (state.grounded && state.support) {
          const support = surfaces.find(rect => rect.el === state.support);
          if (!support || !overlapsPlatform(support)) {
            state.grounded = false;
            state.support = null;
          }
        }

        // One-way platforms: pass through from below, land only when falling across a top.
        // Check the entire vertical step so a dash or fast fall cannot tunnel through a card.
        if (!state.grounded && state.vy >= 0) {
          const nextFeet = state.y + FEET;
          const landing = surfaces.filter(rect =>
            overlapsPlatform(rect) && previousFeet <= rect.top + .5 && nextFeet >= rect.top
          ).sort((a, b) => a.top - b.top)[0];
          if (landing || nextFeet >= floor) {
            state.y = (landing ? landing.top : floor) - FEET;
            state.vy = 0;
            state.grounded = true;
            state.support = landing ? landing.el : null;
            state.groundPound = false;
          }
        }

        if (state.y < -PH * .65) {
          state.y = -PH * .65;
          state.vy = Math.max(0, state.vy);
        }
        checkPortals(previous);
      }

      function updateSpeech() {
        const line = state.emoteTimer > 0 ? EMOTES[state.emoteIndex].line
          : (state.grounded && state.support ? state.support.getAttribute('data-jensen-speech') : null);
        speech.hidden = !line;
        if (!line) return;
        if (speech.textContent !== line) speech.textContent = line;

        const viewportX = state.x - scrollX;
        const viewportY = state.y - scrollY;
        const margin = 12;
        const gap = 12;
        speech.style.maxWidth = `${Math.min(240, innerWidth - margin * 2)}px`;

        // Move beside Jensen if the usual bubble would be clipped by the viewport's top.
        if (viewportY - speech.offsetHeight - gap < margin) {
          const roomRight = innerWidth - margin - viewportX - PW - gap;
          const roomLeft = viewportX - margin - gap;
          const onRight = roomRight >= roomLeft;
          speech.dataset.placement = onRight ? 'right' : 'left';
          speech.style.maxWidth = `${Math.max(28, Math.min(240, onRight ? roomRight : roomLeft))}px`;
          const width = speech.offsetWidth;
          const height = speech.offsetHeight;
          const desiredLeft = onRight ? PW + gap : -gap - width;
          const left = Math.max(margin - viewportX, Math.min(desiredLeft, innerWidth - margin - viewportX - width));
          const top = Math.max(margin - viewportY, Math.min(18, innerHeight - margin - viewportY - height));
          speech.style.left = `${left}px`;
          speech.style.setProperty('--bubble-top', `${top}px`);
          speech.style.setProperty('--tail-top', `${Math.max(12, Math.min(height - 12, PH * .3 - top))}px`);
        } else {
          speech.dataset.placement = 'above';
          const width = speech.offsetWidth;
          const left = Math.max(margin - viewportX, Math.min(PW / 2 - width / 2, innerWidth - margin - viewportX - width));
          speech.style.left = `${left}px`;
          speech.style.setProperty('--tail-left', `${Math.max(12, Math.min(width - 12, PW / 2 - left))}px`);
        }
      }

      function render(dt) {
        player.style.transform = `translate3d(${state.x - scrollX}px, ${state.y - scrollY}px, 0)`;
        player.classList.toggle('facing-left', state.facing < 0);
        player.classList.toggle('jensen-dashing', state.dashTimer > 0);
        player.classList.toggle('jensen-ground-pound', state.groundPound && state.emoteTimer <= 0);
        statusText.textContent = state.grounded ? (state.support ? `On ${state.support.getAttribute('data-jensen-platform-label') || 'a card'}` : 'On the ground') : (state.vy < 0 ? 'Jumping' : 'Falling');
        updateSpeech();

        if (state.emoteTimer > 0) {
          const emote = EMOTES[state.emoteIndex];
          const elapsed = emote.frames * 10 + EMOTE_EXTRA_TICKS - state.emoteTimer;
          const frame = Math.floor(elapsed / 10) % emote.frames;
          statusText.textContent = emote.label;
          setFrame(frame, emote.row);
          return;
        }

        if (!state.grounded) {
          setFrame(state.groundPound ? 4 : 2, state.groundPound ? 2 : 1);
        } else if (Math.abs(state.vx) > .7) {
          runFrameClock += dt;
          if (runFrameClock > 3.2) {
            runFrameClock = 0;
            runFrameIndex = (runFrameIndex + 1) % 8;
          }
          setFrame(runFrameIndex, 1);
        } else {
          runFrameClock = 0;
          setFrame(0, 0);
        }
      }

      function tick(now) {
        const dt = Math.min(2.2, Math.max(.25, (now - lastTime) / 16.6667));
        lastTime = now;
        simulate(dt);
        render(dt);
        requestAnimationFrame(tick);
      }

      addEventListener('scroll', () => render(0), { passive: true });
      addEventListener('resize', () => {
        state.x = Math.max(-12, Math.min(state.x, innerWidth - PW + 12));
        simulate(0);
        render(0);
      });
      scoreText.textContent = `${platforms.length} platforms`;
      resetPosition();
      requestAnimationFrame(tick);
    })();
