const EFFECT_ROOT = '/vendor/showdown/fx/';
const MOTION_REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
const spriteHomeRects = new WeakMap();

function animateElement(element, from, to, duration, delay = 0, easing = 'ease-out') {
  if (!element?.animate) return;
  const speed = MOTION_REDUCED.matches ? 0.01 : 1;
  element.animate([from, to], {
    duration: Math.max(1, duration * speed),
    delay: Math.max(0, delay * speed),
    easing,
    fill: 'forwards',
  });
}

function getPosition(loc, data, rect, anchorSprite = null) {
  const point = { x: 0, y: 0, z: 0, scale: 1, opacity: 1, ...loc };
  point.xscale ??= point.scale;
  point.yscale ??= point.scale;
  const scale = data.gen === 5 ? 2 - point.z / 200 : 1.5 - 0.5 * (point.z / 200);
  const safeScale = Math.max(0.1, scale);
  const xScale = rect.width / 420;
  const yScale = rect.height / 360;
  const sizeScale = Math.min(xScale, yScale);
  const width = (data.w || 80) * safeScale * point.xscale * sizeScale;
  const height = (data.h || 80) * safeScale * point.yscale * sizeScale;
  const topOffset = ((data.h || 80) - (data.y || 0) * 2) * safeScale * point.yscale * sizeScale;
  const anchorHome = anchorSprite && spriteHomeRects.get(anchorSprite.element);
  const anchorX = anchorHome
    ? anchorHome.centerX * rect.width + (point.x - anchorSprite.x) * safeScale * xScale + 220 * (point.z / 200) * xScale
    : (210 + (410 - 190) * (point.z / 200) + point.x * safeScale) * xScale;
  const anchorY = anchorHome
    ? anchorHome.centerY * rect.height - (point.y - anchorSprite.y) * safeScale * yScale + (135 - 245) * (point.z / 200) * yScale
    : (245 + (135 - 245) * (point.z / 200) - point.y * safeScale) * yScale;
  return {
    left: anchorX - width / 2,
    top: anchorY - topOffset / 2,
    width,
    height,
    opacity: point.opacity,
    zIndex: Math.round(8 + point.z / 10),
  };
}

function localizeBackground(background) {
  return String(background).replace(/https?:\/\/[^/]+\/fx\//g, EFFECT_ROOT);
}

function makeSprite(side, scene, reset = true) {
  const element = document.querySelector(`#${side}-sprite`);
  const isPlayer = side === 'player';
  if (reset) {
    for (const animation of element.getAnimations()) animation.cancel();
    element.style.transform = '';
    element.style.opacity = '';
  }
  const arenaRect = scene.arena.getBoundingClientRect();
  let spriteRect = element.getBoundingClientRect();
  if (spriteRect.width && spriteRect.height) {
    spriteHomeRects.set(element, {
      centerX: (spriteRect.left + spriteRect.width / 2 - arenaRect.left) / arenaRect.width,
      centerY: (spriteRect.top + spriteRect.height / 2 - arenaRect.top) / arenaRect.height,
      width: spriteRect.width / arenaRect.width,
      height: spriteRect.height / arenaRect.height,
    });
  } else {
    const previousHome = spriteHomeRects.get(element);
    const width = isPlayer ? 195 : 125;
    const height = isPlayer ? 170 : 112;
    const home = arenaRect.width && arenaRect.height ? previousHome : null;
    const centerX = home ? arenaRect.left + home.centerX * arenaRect.width : arenaRect.left + arenaRect.width * (isPlayer ? 0.2 : 0.8);
    const centerY = home ? arenaRect.top + home.centerY * arenaRect.height : arenaRect.top + arenaRect.height * (isPlayer ? 0.75 : 0.25);
    spriteRect = {
      left: centerX - (home ? home.width * arenaRect.width : width) / 2,
      top: centerY - (home ? home.height * arenaRect.height : height) / 2,
      width: home ? home.width * arenaRect.width : width,
      height: home ? home.height * arenaRect.height : height,
    };
  }
  if (reset) element.dataset.animationEpoch = String((Number(element.dataset.animationEpoch) || 0) + 1);
  const animationEpoch = Number(element.dataset.animationEpoch) || 0;
  const xScale = arenaRect.width / 420;
  const yScale = arenaRect.height / 360;
  const baseX = (spriteRect.left + spriteRect.width / 2 - arenaRect.left) / xScale;
  const baseY = (spriteRect.top + spriteRect.height / 2 - arenaRect.top) / yScale;
  const sceneScale = 2;
  return {
    element,
    scene,
    sp: { url: element.currentSrc || element.src, w: 100, h: 100, y: 0, gen: 5 },
    x: (baseX - 210) / sceneScale,
    y: (245 - baseY) / sceneScale,
    z: 0,
    baseX: (baseX - 210) / sceneScale,
    baseY: (245 - baseY) / sceneScale,
    baseZ: 0,
    isFrontSprite: isPlayer,
    isMissedPokemon: false,
    isSubActive: false,
    delayMs: 0,
    queueMs: 0,
    scale: 1,
    opacity: 1,
    behind(offset) { return this.z + (this.isFrontSprite ? 1 : -1) * offset; },
    behindx(offset) { return this.x + (this.isFrontSprite ? 1 : -1) * offset; },
    behindy(offset) { return this.y + (this.isFrontSprite ? -1 : 1) * offset; },
    leftof(offset) { return this.x + (this.isFrontSprite ? 1 : -1) * offset; },
    delay(milliseconds) { this.delayMs += milliseconds; return this; },
    anim(end = {}, transition = 'linear') {
      const from = { x: this.x, y: this.y, z: this.z, scale: this.scale, opacity: this.opacity };
      const to = { ...from, ...end };
      const rect = arenaRect;
      const scaleFor = z => Math.max(0.1, 2 - z / 200);
      const frame = point => ({
        transform: `translate(${((210 + 220 * point.z / 200 + point.x * scaleFor(point.z) - (210 + this.baseX * scaleFor(this.baseZ))) / 420) * rect.width}px, ${((245 - 110 * point.z / 200 - point.y * scaleFor(point.z) - (245 - 110 * this.baseZ / 200 - this.baseY * scaleFor(this.baseZ))) / 360) * rect.height}px) scale(${point.scale * scaleFor(point.z) / scaleFor(this.baseZ)})`,
        opacity: point.opacity,
      });
      const duration = Number.isFinite(to.time) ? to.time : 500;
      animateElement(element, frame(from), frame(to), duration, this.queueMs + this.delayMs, transition === 'ballistic' ? 'cubic-bezier(.3,.1,.7,1)' : 'ease-in-out');
      this.queueMs += duration;
      this.delayMs = 0;
      this.x = to.x; this.y = to.y; this.z = to.z;
      this.scale = to.scale; this.opacity = to.opacity;
      return this;
    },
    returnHome() {
      const point = { x: this.x, y: this.y, z: this.z, scale: this.scale, opacity: this.opacity };
      const scaleFor = z => Math.max(0.1, 2 - z / 200);
      const from = {
        transform: `translate(${((210 + 220 * point.z / 200 + point.x * scaleFor(point.z) - (210 + this.baseX * scaleFor(this.baseZ))) / 420) * arenaRect.width}px, ${((245 - 110 * point.z / 200 - point.y * scaleFor(point.z) - (245 - 110 * this.baseZ / 200 - this.baseY * scaleFor(this.baseZ))) / 360) * arenaRect.height}px) scale(${point.scale * scaleFor(point.z) / scaleFor(this.baseZ)})`,
        opacity: point.opacity,
      };
      const motionScale = MOTION_REDUCED.matches ? 0.01 : 1;
      const returnDuration = Math.max(1, 180 * motionScale);
      window.setTimeout(() => {
        if ((Number(element.dataset.animationEpoch) || 0) !== animationEpoch) return;
        animateElement(element, from, { transform: 'translate(0px, 0px) scale(1)', opacity: 1 }, 180);
        window.setTimeout(() => {
          if ((Number(element.dataset.animationEpoch) || 0) !== animationEpoch) return;
          for (const animation of element.getAnimations()) animation.cancel();
          element.style.transform = '';
          element.style.opacity = '';
        }, returnDuration + 40);
      }, MOTION_REDUCED.matches ? 30 : this.queueMs + this.delayMs);
    },
  };
}

function createScene() {
  const arena = document.querySelector('#arena');
  const layer = document.querySelector('#move-effect-layer');
  const scene = {
    arena,
    layer,
    timeOffset: 0,
    animating: true,
    acceleration: 1,
    battle: { mySide: 0 },
    wait(milliseconds) { this.timeOffset += milliseconds; },
    showEffect(effect, start = {}, end = {}, transition = 'linear', after = '') {
      const data = typeof effect === 'string' ? window.BattleEffects?.[effect] : effect;
      if (!data) return null;
      const element = data.url ? document.createElement('img') : document.createElement('span');
      element.className = `showdown-effect${data.rawHTML ? ` showdown-effect-${data.rawHTML.match(/sidecondition-([\w-]+)/)?.[1] || 'status'}` : ''}`;
      if (data.url) {
        element.src = data.url.startsWith('/') || /^https?:/i.test(data.url) ? data.url : `${EFFECT_ROOT}${data.url}`;
        element.alt = '';
        element.style.display = 'block';
      }
      element.setAttribute('aria-hidden', 'true');
      element.style.position = 'absolute';
      element.style.pointerEvents = 'none';
      this.layer.append(element);
      const rect = this.layer.getBoundingClientRect();
      const anchoredEarthquakeRock = this.effectAnchorSide &&
        ['earthquake', 'magnitude', 'fissure', 'landswrath'].includes(this.moveId) &&
        (effect === 'rock3' || effect?.url === window.BattleEffects?.rock3?.url)
        ? this.sprites?.[this.effectAnchorSide]
        : null;
      const startState = { x: 0, y: 0, z: 0, scale: 1, opacity: 1, ...start };
      const endState = { ...startState, ...end };
      const toCSS = position => {
        const coords = getPosition(position, data, rect, anchoredEarthquakeRock);
        return { left: `${coords.left}px`, top: `${coords.top}px`, width: `${coords.width}px`, height: `${coords.height}px`, opacity: coords.opacity, zIndex: coords.zIndex };
      };
      const startTime = Number(start.time) || 0;
      const endTime = Number(end.time) || startTime + 500;
      const from = toCSS(startState);
      const to = toCSS(endState);
      if (after === 'explode') {
        to.width = `${parseFloat(to.width) * 3}px`;
        to.height = `${parseFloat(to.height) * 3}px`;
        to.opacity = 0;
      }
      Object.assign(element.style, from);
      if (element.animate) {
        animateElement(element, from, to, Math.max(1, endTime - startTime), this.timeOffset + startTime, transition === 'decel' ? 'cubic-bezier(.1,.8,.2,1)' : 'ease-out');
      } else {
        Object.assign(element.style, to);
      }
      const lifetime = this.timeOffset + endTime + (after === 'fade' ? 110 : after === 'explode' ? 220 : 1000);
      window.setTimeout(() => element.remove(), MOTION_REDUCED.matches ? 40 : lifetime);
      return element;
    },
    animateEffect(element, effect, start, end, transition, after) {
      if (element && effect) return this.showEffect(effect, start, end, transition, after);
      return null;
    },
    backgroundEffect(background, duration, opacity = 1, delay = 0) {
      const overlay = document.createElement('span');
      overlay.className = 'showdown-background-effect';
      overlay.style.background = localizeBackground(background);
      overlay.style.opacity = '0';
      this.layer.append(overlay);
      const fadeDuration = 250;
      const fadeOutDelay = this.timeOffset + delay + fadeDuration + Math.max(0, duration - fadeDuration);
      animateElement(overlay, { opacity: 0 }, { opacity }, fadeDuration, this.timeOffset + delay);
      window.setTimeout(() => {
        if (!overlay.isConnected) return;
        animateElement(overlay, { opacity }, { opacity: 0 }, fadeDuration);
        window.setTimeout(() => overlay.remove(), MOTION_REDUCED.matches ? 40 : fadeDuration + 30);
      }, MOTION_REDUCED.matches ? fadeOutDelay * 0.01 : fadeOutDelay);
    },
  };
  const bg = document.createElement('span');
  bg.className = 'showdown-bg-tint';
  scene.layer.append(bg);
  scene.$bg = {
    delayMs: 0,
    css(styles) { for (const [key, value] of Object.entries(styles || {})) bg.style[key] = typeof value === 'number' ? String(value) : value; return this; },
    delay(milliseconds = 0) { this.delayMs += Math.max(0, Number(milliseconds) || 0); return this; },
    animate(styles, duration = 300) {
      const from = { opacity: Number.parseFloat(bg.style.opacity || '0') };
      const to = { ...from, ...styles };
      animateElement(bg, from, to, duration, this.delayMs);
      this.delayMs = 0;
      return this;
    },
  };
  return scene;
}

function getSprite(side, scene, reset = true) {
  const sprite = makeSprite(side, scene, reset);
  scene.sprites[side] = sprite;
  return sprite;
}

export function playShowdownMove(moveId, userSide, targetSide, { keepAttackerHome = false } = {}) {
  const moveAnims = window.BattleMoveAnims;
  if (!moveAnims) return false;
  const scene = createScene();
  scene.sprites = {};
  scene.moveId = moveId;
  scene.effectAnchorSide = targetSide;
  const attacker = getSprite(userSide, scene);
  const defender = getSprite(targetSide, scene);
  if (keepAttackerHome) {
    // Some Showdown moves lunge or hide the real sprite for a long animation.
    // Keep its DOM identity planted across a switch or faint; sprite clones and
    // impact effects still carry the attack animation.
    attacker.anim = function(end = {}) {
      this.queueMs += Math.max(0, Number(end.time) || 0);
      this.delayMs = 0;
      return this;
    };
  }
  const entry = moveAnims[moveId] || moveAnims.tackle;
  try { entry?.anim?.(scene, [attacker, defender]); }
  catch (error) { console.warn(`Showdown animation failed for ${moveId}:`, error); }
  attacker.returnHome();
  if (targetSide !== userSide) defender.returnHome();
  return true;
}

export function playShowdownPrepare(moveId, userSide, targetSide) {
  const entry = window.BattleMoveAnims?.[moveId];
  if (!entry?.prepareAnim) return false;
  const scene = createScene();
  scene.sprites = {};
  const attacker = getSprite(userSide, scene);
  const defender = getSprite(targetSide, scene);
  try { entry.prepareAnim(scene, [attacker, defender]); }
  catch (error) { console.warn(`Showdown preparation animation failed for ${moveId}:`, error); }
  attacker.returnHome();
  if (targetSide !== userSide) defender.returnHome();
  return true;
}

