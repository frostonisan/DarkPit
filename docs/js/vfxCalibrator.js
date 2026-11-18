/* Stand-alone index-16 editor. No combat imports and no game-save writes. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const catalog = [
    ['indestructibility', 'Indestructibilité', 'indestructibility.gif', 110, 1200, 'Capacités'],
    ['astrality', 'Astralité', 'astrality.gif', 110, 2500, 'Capacités'],
    ['resilience', 'Résilience totale', 'resilience-cancel.gif', 110, 2100, 'Capacités'],
    ['ambidextry', 'Ambidextrie', 'ambidextry.gif', 110, 1800, 'Capacités'],
    ['esoterism', 'Ésotérisme', 'esoterism.gif', 110, 1100, 'Capacités'],
    ['transcendence', 'Transcendance', 'transcendence.gif', 110, 3400, 'Capacités'],
    ['bloodfuryexec', 'Exécution', 'bloodFuryExec.gif', 110, 1000, 'Capacités'],
    ['recovery', 'Récupération', 'recovery.gif', 110, 1800, 'Capacités'],
    ['stun', 'Étourdissement', 'stun.gif', 64, 2000, 'Effets'],
    ['mysticism', 'Transe mystique', 'mysticism.gif', 140, 2500, 'Effets'],
    ['heal', 'Soin', 'heal.gif', 110, 1800, 'Effets'],
    ['burn', 'Brûlure', 'burn.gif', 110, 2000, 'Effets'],
    ['poison', 'Poison', 'poison.gif', 110, 2000, 'Effets'],
    ['lifesteal', 'Vol de vie', 'blood-loss.gif', 110, 2000, 'Effets'],
    ['extraLife', 'Vie supplémentaire', 'life.gif', 110, 2000, 'Vies et mouvements'],
    ['fadedLife', 'Vie fanée', 'fadedlife.gif', 110, 2000, 'Vies et mouvements'],
    ['eternalLife', 'Vie éternelle', 'eternallife.gif', 110, 2000, 'Vies et mouvements'],
    ['dodge', 'Esquive', 'dodge.gif', 110, 1000, 'Vies et mouvements'],
    ['death-blood', 'Mort', 'death-blood.gif', 110, 2000, 'Vies et mouvements'],
    ['broken-spell', 'Sort interrompu', 'broken-spell.gif', 110, 1500, 'Vies et mouvements'],
  ].map(([key, label, file, cap, duration, group]) => ({ key, label, file, cap, duration, group,
    className: key === 'recovery' ? 'recoveryGif' : `effect-vfx ${key}` }));
  const assets = new Map(catalog.map(asset => [asset.key, asset]));
  const settings = new Map(), dirty = new Set(), previews = [];
  const rules = document.createElement('style'); rules.id = 'vfx-calibration-rules'; document.head.append(rules);
  const fields = ['top', 'x', 'width', 'ratio', 'cap'];
  const round = value => Math.round(value * 1000000) / 1000000;
  let selected = catalog[0].key, sequence = 0, revision = 0, timer = null, baseWidth = 120, baseHeight = 120;
  let loading = true;

  function selector(asset) { return `.entity-visual-frame > .effects-container > img.${asset.className.replaceAll(' ', '.')}`; }
  function cssFor(key) {
    const asset = assets.get(key), value = settings.get(key);
    if (!value) return '';
    const width = value.widthUnit === '%' ? `calc(var(--sprite-w) * ${round(value.width / 100)})` : `${round(value.width)}px`;
    // Only geometry is overridden. Native GIF playback, fades, filters and
    // transforms remain intact. Important offsets cover AmbidextryVFX's inline placement.
    return `/* ${asset.label} */\n${selector(asset)} {\n  --vfx-size: min(${width}, ${round(value.cap)}px);\n  top: ${round(value.top)}${value.topUnit} !important;\n  bottom: auto !important;\n  ${value.side}: ${round(value.x)}${value.xUnit} !important;\n  ${value.side === 'left' ? 'right' : 'left'}: auto !important;\n  width: var(--vfx-size) !important;\n  height: calc(var(--vfx-size) * ${round(value.ratio / 100)}) !important;\n  max-width: none !important;\n  max-height: none !important;\n}`;
  }
  function allCss() { return [...dirty].map(cssFor).join('\n\n'); }
  function applyRules() {
    rules.textContent = [...new Set([...dirty, selected])].map(cssFor).filter(Boolean).join('\n\n');
    $('vfx-css').value = cssFor(selected) || 'Chargement du VFX…';
    $('vfx-count').textContent = `${dirty.size} réglage${dirty.size > 1 ? 's' : ''}`;
    $('vfx-copy-all').disabled = !dirty.size;
  }
  function updateFields() {
    const value = settings.get(selected); if (!value) return;
    for (const field of fields) {
      const slider = $(`vfx-${field}`), number = $(`vfx-${field}-number`);
      slider.min = Math.min(Number(number.min), value[field]);
      slider.max = Math.max(field === 'ratio' ? 300 : field === 'cap' ? 300 : 200, value[field]);
      slider.value = String(value[field]); number.value = String(Math.round(value[field] * 100) / 100);
      if (field !== 'cap') number.step = 'any';
    }
    for (const field of ['top', 'x', 'width']) $(`vfx-${field}-unit`).value = value[`${field}Unit`];
    $('vfx-side').value = value.side;
  }
  function changed() {
    dirty.add(selected); updateFields(); applyRules(); $('vfx-feedback').textContent = 'Aperçu et CSS mis à jour.';
  }
  function clearTimer() { clearTimeout(timer); timer = null; }
  function syncTargets() {
    for (const preview of previews) {
      preview.frame.hidden = !$('vfx-visible').checked || ($('vfx-target').value !== 'all' && preview.id !== $('vfx-target').value);
      preview.frame.dataset.guides = String($('vfx-guides').checked);
    }
  }
  function play() {
    const asset = assets.get(selected);
    // One IMG per entity; replacing it with a fresh fragment also restarts GIFs
    // with a finite loop count, without accumulating readers or uncached URLs.
    for (const preview of previews) {
      const img = new Image(); img.alt = asset.label; img.draggable = false; img.className = asset.className;
      if (asset.key === 'ambidextry') Object.assign(img.style, { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' });
      img.src = `media/assets/effects/${asset.file}#calibrate-${++sequence}`;
      preview.host.replaceChildren(img);
    }
    syncTargets();
  }
  function schedule() {
    clearTimer();
    if (loading || document.hidden || !$('vfx-visible').checked || !$('vfx-loop').checked) return;
    timer = setTimeout(() => { timer = null; play(); schedule(); }, assets.get(selected).duration);
  }
  async function selectEffect(key, reset = false) {
    const token = ++revision; selected = key; loading = true; clearTimer();
    $('vfx-controls').disabled = true; $('vfx-copy').disabled = true;
    if (reset) { settings.delete(key); dirty.delete(key); }
    applyRules(); play();
    try {
      const img = previews[0].host.firstElementChild;
      await img.decode();
      if (token !== revision) return;
      if (!settings.has(key)) {
        // Local CSS only, once per effect/reset. No transformed DOM rectangle,
        // reads while dragging a control, or animation-frame polling.
        const css = getComputedStyle(img);
        const w = parseFloat(css.width), h = parseFloat(css.height);
        if (!(w > 0 && h > 0)) throw Error('Dimensions du VFX indisponibles.');
        settings.set(key, { top: round((parseFloat(css.top) || 0) / baseHeight * 100), x: round((parseFloat(css.left) || 0) / baseWidth * 100),
          topUnit: '%', xUnit: '%', side: 'left', width: round(w / baseWidth * 100), widthUnit: '%', ratio: round(h / w * 100), cap: assets.get(key).cap });
      }
      loading = false; updateFields(); applyRules(); $('vfx-controls').disabled = false; $('vfx-copy').disabled = false;
      $('vfx-feedback').textContent = key === 'astrality' ? 'Le GIF Astralité est très discret ; le gabarit aide à le repérer.' : 'Les trois tailles utilisent la même règle CSS.';
      schedule();
    } catch (error) {
      if (token !== revision) return;
      loading = false; $('vfx-controls').disabled = false;
      $('vfx-feedback').textContent = `VFX non chargé : ${error.message}`;
    }
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const field = document.createElement('textarea'); field.value = text; field.style.cssText = 'position:fixed;left:-10000px;top:0'; document.body.append(field); field.select();
      const copied = document.execCommand('copy'); field.remove();
      if (!copied) { $('vfx-css').value = text; $('vfx-css').focus(); $('vfx-css').select(); $('vfx-feedback').textContent = 'Texte sélectionné : Ctrl+C pour copier.'; return; }
    }
    $('vfx-feedback').textContent = 'CSS copié.';
  }
  const ready = window.hexGroupLab.ready.then(async () => {
    let group;
    for (const asset of catalog) {
      if (group?.label !== asset.group) { group = document.createElement('optgroup'); group.label = asset.group; $('vfx-effect').append(group); }
      group.append(new Option(asset.label, asset.key));
    }
    for (const actor of document.querySelectorAll('.actor-anchor')) {
      const frame = document.createElement('span'); frame.className = 'entity-visual-frame vfx-calibration-frame';
      const width = actor.style.getPropertyValue('--sprite-w'), height = actor.style.getPropertyValue('--sprite-h');
      frame.style.setProperty('--popup-sprite-w', width); frame.style.setProperty('--popup-sprite-h', height);
      const host = document.createElement('span'); host.className = 'effects-container'; frame.append(host); actor.querySelector('.entity-frame').append(frame);
      previews.push({ id: actor.dataset.entity, frame, host });
      if (previews.length === 1) { baseWidth = parseFloat(width); baseHeight = parseFloat(height); }
    }
    $('vfx-effect').addEventListener('change', () => selectEffect($('vfx-effect').value));
    for (const field of fields) for (const suffix of ['', '-number']) $(`vfx-${field}${suffix}`).addEventListener('input', event => {
      if (!settings.has(selected) || !event.target.validity.valid || event.target.value === '') return;
      const value = event.target.valueAsNumber; if (!Number.isFinite(value)) return;
      settings.get(selected)[field] = value; changed();
    });
    for (const field of ['top', 'x', 'width']) $(`vfx-${field}-unit`).addEventListener('change', event => {
      const value = settings.get(selected); if (!value) return;
      const dimension = field === 'top' ? baseHeight : baseWidth;
      const pixels = value[`${field}Unit`] === '%' ? value[field] * dimension / 100 : value[field];
      value[`${field}Unit`] = event.target.value; value[field] = round(event.target.value === '%' ? pixels / dimension * 100 : pixels); changed();
    });
    $('vfx-side').addEventListener('change', event => {
      const value = settings.get(selected); if (!value) return;
      const w = Math.min(value.widthUnit === '%' ? baseWidth * value.width / 100 : value.width, value.cap);
      const x = value.xUnit === '%' ? value.x * baseWidth / 100 : value.x;
      value.x = round(value.xUnit === '%' ? (baseWidth - x - w) / baseWidth * 100 : baseWidth - x - w);
      value.side = event.target.value; changed();
    });
    for (const id of ['vfx-visible', 'vfx-target', 'vfx-guides']) $(id).addEventListener('change', () => { syncTargets(); schedule(); });
    $('vfx-loop').addEventListener('change', schedule);
    $('vfx-replay').addEventListener('click', () => { play(); schedule(); });
    $('vfx-reset').addEventListener('click', () => selectEffect(selected, true));
    $('vfx-copy').addEventListener('click', () => copy(cssFor(selected)));
    $('vfx-copy-all').addEventListener('click', () => copy(allCss()));
    document.addEventListener('visibilitychange', () => { clearTimer(); if (!document.hidden && $('vfx-visible').checked) { play(); schedule(); } });
    window.addEventListener('pagehide', clearTimer);
    await selectEffect(selected);
  }).catch(error => { $('vfx-feedback').textContent = `Calibrateur indisponible : ${error.message}`; throw error; });
  window.vfxCalibrator = { ready, inspect: () => ({ selected, loading, sequence, timer: timer !== null, dirty: [...dirty],
    settings: Object.fromEntries([...settings].map(([key, value]) => [key, { ...value }])), css: cssFor(selected), allCss: allCss() }) };
})();
