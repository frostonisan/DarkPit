const DIALOGUE_ARCH_POSITIONS = [
  'top-right',
  'top-left',
  'bottom-right',
  'bottom-left'
];
const TYPEWRITER_SPEED = 50;
const CHOICE_FADE_INITIAL_DELAY = 700;
const CHOICE_FADE_DELAY = 500;
const CHOICE_FADE_DURATION = 500;
const DEFAULT_PORTRAIT_SRC = './media/portrait/unknown.jpg';
const DIALOGUE_INTERACTION_STYLE_ID = 'dialogue-interaction-styles';
const EVENT_CHOICE_AMBIANT_STYLE_ID = 'event-choice-ambiant-styles';
const EVENT_CHOICE_AMBIANT_FADE_DURATION = 180;

let activeDialogueTextAnimation = null;
const activeChoiceRevealTimers = new Set();
const dialogueSkipContainers = new WeakSet();
let eventChoiceAmbiantFadeTimer = null;

function collectTypewriterEntries(element, result = []) {
  for (const node of [...element.childNodes]) {
    if (node.nodeType === 3) {
      result.push({
        type: 'text',
        node,
        content: node.textContent || ''
      });
    } else if (node.nodeType === 1) {
      const isAtomicElement = (
        node.tagName === 'BR'
        || node.dataset?.typewriterAtomic === 'true'
        || (node.textContent || '').length === 0
      );
      const isTimedInlineContainer = node.tagName === 'SPAN' && !isAtomicElement;
      if (isAtomicElement || isTimedInlineContainer) {
        result.push({
          type: 'element',
          node,
          display: node.style.display
        });
      }
      if (!isAtomicElement) {
        collectTypewriterEntries(node, result);
      }
    }
  }
  return result;
}

function hideTypewriterEntry(entry) {
  if (entry.type === 'text') entry.node.textContent = '';
  else entry.node.style.display = 'none';
}

function revealTypewriterEntry(entry) {
  if (entry.type === 'text') entry.node.textContent = entry.content;
  else entry.node.style.display = entry.display;
}

function cancelDialogueTextAnimation() {
  if (!activeDialogueTextAnimation) return;
  clearTimeout(activeDialogueTextAnimation.timer);
  activeDialogueTextAnimation.resolve(false);
  activeDialogueTextAnimation = null;
}

function completeDialogueTextAnimation() {
  const animation = activeDialogueTextAnimation;
  if (!animation) return false;

  clearTimeout(animation.timer);
  for (const entry of animation.entries) revealTypewriterEntry(entry);
  activeDialogueTextAnimation = null;
  animation.resolve(true);
  return true;
}

function ensureDialogueInteractionStyles() {
  if (document.getElementById(DIALOGUE_INTERACTION_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = DIALOGUE_INTERACTION_STYLE_ID;
  style.textContent = `
    .dialogue-continue.cut {
      opacity: 0.8;
    }

    .dialogue-choice.condition .label::before {
      content: none;
      display: none;
    }
  `;
  document.head.appendChild(style);
}

function ensureEventChoiceAmbiantStyles() {
  if (document.getElementById(EVENT_CHOICE_AMBIANT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = EVENT_CHOICE_AMBIANT_STYLE_ID;
  style.textContent = `
    #game-container.event-choice-ambiant::after,
    #game-container.event-choice-ambiant-out::after {
      content: "";
      position: fixed;
      inset: 0;
      z-index: 999999;
      pointer-events: none;
      background: radial-gradient(
        ellipse at center,
        rgba(255, 168, 23, 0.03) 25%,
        rgba(255, 168, 23, 0.22) 65%,
        rgba(255, 168, 23, 0.35) 100%
      );
      box-shadow:
        inset 120px 0 110px rgba(255, 168, 23, 0.15),
        inset -120px 0 110px rgba(255, 168, 23, 0.05);
      opacity: 0.15;
      will-change: opacity;
    }

    #game-container.event-choice-ambiant::after {
      animation:
        event-choice-ambiant-in ${EVENT_CHOICE_AMBIANT_FADE_DURATION}ms ease-out,
        pulsation-mortelle 2.2s ease-in-out ${EVENT_CHOICE_AMBIANT_FADE_DURATION}ms infinite;
    }

    #game-container.event-choice-ambiant-out::after {
      animation: event-choice-ambiant-out ${EVENT_CHOICE_AMBIANT_FADE_DURATION}ms ease-in forwards;
    }

    @keyframes event-choice-ambiant-in {
      from { opacity: 0; }
      to { opacity: 0.15; }
    }

    @keyframes event-choice-ambiant-out {
      from { opacity: 0.15; }
      to { opacity: 0; }
    }

    @keyframes pulsation-mortelle {
      0%, 100% { opacity: 0.15; }
      50% { opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      #game-container.event-choice-ambiant::after,
      #game-container.event-choice-ambiant-out::after {
        animation: none;
        opacity: 0.65;
      }
    }
  `;
  document.head.appendChild(style);
}

export function eventChoiceAmbiant(active = true) {
  const gameContainer = document.getElementById('game-container');
  if (!gameContainer) return false;

  ensureEventChoiceAmbiantStyles();
  clearTimeout(eventChoiceAmbiantFadeTimer);
  eventChoiceAmbiantFadeTimer = null;

  if (active) {
    gameContainer.classList.remove('event-choice-ambiant-out');
    gameContainer.classList.add('event-choice-ambiant');
    return true;
  }

  if (!gameContainer.classList.contains('event-choice-ambiant')) {
    gameContainer.classList.remove('event-choice-ambiant-out');
    return false;
  }

  gameContainer.classList.remove('event-choice-ambiant');
  gameContainer.classList.add('event-choice-ambiant-out');
  eventChoiceAmbiantFadeTimer = setTimeout(() => {
    gameContainer.classList.remove('event-choice-ambiant-out');
    eventChoiceAmbiantFadeTimer = null;
  }, EVENT_CHOICE_AMBIANT_FADE_DURATION);

  return true;
}

function bindDialogueSkip(dialogueContainer) {
  if (dialogueSkipContainers.has(dialogueContainer)) return;

  dialogueSkipContainers.add(dialogueContainer);
  dialogueContainer.addEventListener('dblclick', (event) => {
    event.preventDefault();
    completeDialogueTextAnimation();
  });
}

function cancelChoiceReveals() {
  for (const timer of activeChoiceRevealTimers) clearTimeout(timer);
  activeChoiceRevealTimers.clear();
}

export function typeDialogueText(loreText, html, {
  speed = TYPEWRITER_SPEED
} = {}) {
  cancelDialogueTextAnimation();
  loreText.innerHTML = String(html ?? '');

  const entries = collectTypewriterEntries(loreText);
  const totalCharacters = entries.reduce(
    (total, entry) => total + (entry.type === 'text' ? entry.content.length : 1),
    0
  );
  for (const entry of entries) hideTypewriterEntry(entry);

  if (totalCharacters === 0) return Promise.resolve(true);

  const numericSpeed = Number(speed);
  const characterDelay = Number.isFinite(numericSpeed) && numericSpeed >= 0
    ? numericSpeed
    : TYPEWRITER_SPEED;

  if (characterDelay === 0) {
    for (const entry of entries) revealTypewriterEntry(entry);
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const animation = {
      timer: null,
      resolve,
      entries,
      nodeIndex: 0,
      characterIndex: 0
    };
    activeDialogueTextAnimation = animation;

    const writeNextCharacter = () => {
      if (activeDialogueTextAnimation !== animation) return;

      while (
        animation.nodeIndex < entries.length
        && entries[animation.nodeIndex].type === 'text'
        && animation.characterIndex >= entries[animation.nodeIndex].content.length
      ) {
        animation.nodeIndex += 1;
        animation.characterIndex = 0;
      }

      if (animation.nodeIndex >= entries.length) {
        activeDialogueTextAnimation = null;
        resolve(true);
        return;
      }

      const entry = entries[animation.nodeIndex];
      if (entry.type === 'element') {
        revealTypewriterEntry(entry);
        animation.nodeIndex += 1;
        animation.characterIndex = 0;
      } else {
        entry.node.textContent += entry.content[animation.characterIndex];
        animation.characterIndex += 1;
      }
      animation.timer = setTimeout(writeNextCharacter, characterDelay);
    };

    writeNextCharacter();
  });
}

function prepareDialogueChoiceFade(choiceElement) {
  const isInteractive = choiceElement.getAttribute('aria-disabled') !== 'true';

  choiceElement.dataset.interactiveAfterReveal = String(isInteractive);
  choiceElement.classList.add('dialogue-choice-pending');
  choiceElement.style.opacity = '0';
  choiceElement.style.transition = `opacity ${CHOICE_FADE_DURATION}ms ease`;
  choiceElement.style.pointerEvents = 'none';
  choiceElement.setAttribute('aria-disabled', 'true');
  choiceElement.setAttribute('tabindex', '-1');
  choiceElement.setAttribute('aria-hidden', 'true');
}

function unlockDialogueChoices(choiceElements) {
  for (const choiceElement of choiceElements) {
    if (!choiceElement.isConnected) continue;

    const isInteractive = choiceElement.dataset.interactiveAfterReveal === 'true';
    delete choiceElement.dataset.interactiveAfterReveal;

    if (!isInteractive) continue;

    choiceElement.style.pointerEvents = 'auto';
    choiceElement.setAttribute('aria-disabled', 'false');
    choiceElement.setAttribute('tabindex', '0');
  }
}

function revealDialogueChoices(choiceElements, {
  initialDelay = CHOICE_FADE_INITIAL_DELAY,
  staggerDelay = CHOICE_FADE_DELAY
} = {}) {
  cancelChoiceReveals();

  const safeInitialDelay = Math.max(0, Number(initialDelay) || 0);
  const safeStaggerDelay = Math.max(0, Number(staggerDelay) || 0);

  choiceElements.forEach((choiceElement, index) => {
    const timer = setTimeout(() => {
      activeChoiceRevealTimers.delete(timer);
      if (!choiceElement.isConnected) return;

      choiceElement.classList.remove('dialogue-choice-pending');
      choiceElement.classList.add('dialogue-choice-visible');
      choiceElement.style.opacity = '1';
      choiceElement.setAttribute('aria-hidden', 'false');
    }, safeInitialDelay + (index * safeStaggerDelay));
    activeChoiceRevealTimers.add(timer);
  });

  if (choiceElements.length > 0) {
    const unlockDelay = safeInitialDelay
      + ((choiceElements.length - 1) * safeStaggerDelay)
      + CHOICE_FADE_DURATION;
    const unlockTimer = setTimeout(() => {
      activeChoiceRevealTimers.delete(unlockTimer);
      unlockDialogueChoices(choiceElements);
    }, unlockDelay);
    activeChoiceRevealTimers.add(unlockTimer);
  }
}

function ensureDirectDiv(parent, className) {
  const existing = parent.querySelector(`:scope > .${className}`);
  if (existing?.tagName === 'DIV') return existing;

  const element = document.createElement('div');
  element.className = className;

  if (existing) {
    while (existing.firstChild) element.appendChild(existing.firstChild);
    existing.replaceWith(element);
  } else {
    parent.appendChild(element);
  }

  return element;
}

function ensureDialogueText(dialogueContainer, centerBody) {
  let dialogueText = centerBody.querySelector(':scope > .dialogue-text');

  if (!dialogueText) {
    dialogueText = dialogueContainer.querySelector('.dialogue-text');
  }

  if (dialogueText?.tagName !== 'DIV') {
    const replacement = document.createElement('div');
    replacement.className = 'dialogue-text';

    if (dialogueText) {
      replacement.textContent = dialogueText.textContent;
      dialogueText.replaceWith(replacement);
    }

    dialogueText = replacement;
  }

  dialogueText.classList.add('dialogue-text');
  centerBody.appendChild(dialogueText);
  return dialogueText;
}

function ensureLoreText(dialogueText) {
  let loreText = dialogueText.querySelector(':scope > .lore-texte');
  const legacyText = [...dialogueText.childNodes]
    .filter((node) => node.nodeType === 3)
    .map((node) => node.textContent)
    .join('');

  for (const node of [...dialogueText.childNodes]) {
    if (node.nodeType === 3) node.remove();
  }

  if (loreText?.tagName !== 'DIV') {
    const replacement = document.createElement('div');
    replacement.className = 'lore-texte';

    if (loreText) {
      replacement.innerHTML = loreText.innerHTML;
      loreText.replaceWith(replacement);
    }

    loreText = replacement;
  }

  loreText.classList.add('lore-texte');
  if (!loreText.textContent && legacyText) loreText.textContent = legacyText;
  dialogueText.prepend(loreText);
  return loreText;
}

function ensureDialogueArch(gameWindows, dialogueWindow, dialogueMisc, position) {
  let dialogueArch = [dialogueMisc, dialogueWindow, gameWindows]
    .map((parent) => parent.querySelector(`:scope > .dialogue-arch.${position}`))
    .find(Boolean);

  if (dialogueArch?.tagName !== 'DIV') {
    const replacement = document.createElement('div');

    if (dialogueArch) {
      while (dialogueArch.firstChild) replacement.appendChild(dialogueArch.firstChild);
      dialogueArch.replaceWith(replacement);
    }

    dialogueArch = replacement;
  }

  dialogueArch.classList.add('corner', 'dialogue-arch', position);
  dialogueMisc.appendChild(dialogueArch);
  return dialogueArch;
}

/**
 * Crée ou réutilise toute la structure de la fenêtre de dialogue.
 * Tous les éléments générés sont des divs.
 *
 * @param {string} [text=""] Texte à afficher dans la fenêtre.
 *
 * @returns {{
 *   dialogueWindow: HTMLDivElement,
 *   dialogueContainer: HTMLDivElement,
 *   dialogueHeader: HTMLDivElement,
 *   dialogueBody: HTMLDivElement,
 *   dialogueFooter: HTMLDivElement,
 *   dialoguePrevious: HTMLDivElement,
 *   previousLabel: HTMLDivElement,
 *   dialoguePreviousIcon: HTMLDivElement,
 *   dialogueContinue: HTMLDivElement,
 *   continueLabel: HTMLDivElement,
 *   dialogueContinueIcon: HTMLDivElement,
 *   dialogueLeft: HTMLDivElement,
 *   dialogueCenter: HTMLDivElement,
 *   dialogueRight: HTMLDivElement,
 *   centerHeader: HTMLDivElement,
 *   centerBody: HTMLDivElement,
 *   centerFooter: HTMLDivElement,
 *   dialogueText: HTMLDivElement,
 *   loreText: HTMLDivElement,
 *   dialogueMisc: HTMLDivElement,
 *   dialogueUi: HTMLDivElement,
 *   dialogueArches: HTMLDivElement[]
 * } | null}
 */
export function dialogue(text = '') {
  const gameWindows = document.getElementById('game-windows');

  if (!gameWindows) {
    console.error('[Dialogue] #game-windows est introuvable.');
    return null;
  }

  const dialogueWindow = ensureDirectDiv(gameWindows, 'dialogue-window');
  const dialogueContainer = ensureDirectDiv(dialogueWindow, 'dialogue-container');

  bindDialogueSkip(dialogueContainer);

  // Supprime le texte brut laissé directement dans le conteneur par l’ancienne version.
  for (const node of [...dialogueContainer.childNodes]) {
    if (node.nodeType === 3) node.remove();
  }

  const dialogueHeader = ensureDirectDiv(dialogueContainer, 'dialogue-header');
  const dialogueBody = ensureDirectDiv(dialogueContainer, 'dialogue-body');
  const dialogueFooter = ensureDirectDiv(dialogueContainer, 'dialogue-footer');

  const dialoguePrevious = ensureDirectDiv(dialogueFooter, 'dialogue-previous');
  const previousLabel = ensureDirectDiv(dialoguePrevious, 'label');

  if (!previousLabel.textContent.trim()) {
    previousLabel.textContent = 'Précédent';
  }

  const dialoguePreviousIcon = ensureDirectDiv(
    dialoguePrevious,
    'dialogue-previous-icon'
  );

  const dialogueContinue = ensureDirectDiv(dialogueFooter, 'dialogue-continue');
  const continueLabel = ensureDirectDiv(dialogueContinue, 'label');

  if (!continueLabel.textContent.trim()) {
    continueLabel.textContent = 'Continuer';
  }

  const dialogueContinueIcon = ensureDirectDiv(
    dialogueContinue,
    'dialogue-continue-icon'
  );

  const dialogueLeft = ensureDirectDiv(dialogueBody, 'dialogue-left');
  const dialogueCenter = ensureDirectDiv(dialogueBody, 'dialogue-center');
  const dialogueRight = ensureDirectDiv(dialogueBody, 'dialogue-right');

  const centerHeader = ensureDirectDiv(dialogueCenter, 'header');
  const centerBody = ensureDirectDiv(dialogueCenter, 'body');
  const centerFooter = ensureDirectDiv(dialogueCenter, 'footer');

  const dialogueText = ensureDialogueText(dialogueContainer, centerBody);
  const loreText = ensureLoreText(dialogueText);

  void typeDialogueText(loreText, text);

  const dialogueUi = ensureDirectDiv(dialogueWindow, 'dialogue-ui');

  const dialogueArches = DIALOGUE_ARCH_POSITIONS.map((position) => (
    ensureDialogueArch(
      gameWindows,
      dialogueWindow,
      dialogueContainer,
      position
    )
  ));

  // Toujours dernier enfant direct de .dialogue-container
  const dialogueMisc = ensureDirectDiv(dialogueContainer, 'dialogue-misc');
  dialogueContainer.appendChild(dialogueMisc);

  return {
    dialogueWindow,
    dialogueContainer,
    dialogueHeader,
    dialogueBody,
    dialogueFooter,
    dialoguePrevious,
    previousLabel,
    dialoguePreviousIcon,
    dialogueContinue,
    continueLabel,
    dialogueContinueIcon,
    dialogueLeft,
    dialogueCenter,
    dialogueRight,
    centerHeader,
    centerBody,
    centerFooter,
    dialogueText,
    loreText,
    dialogueMisc,
    dialogueUi,
    dialogueArches
  };
}
function clearDiv(element) {
  if (element) element.replaceChildren();
}

function bindDivAction(element, action) {
  let locked = false;

  const activate = async (event) => {
    if (event?.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    event?.preventDefault?.();

    // Pendant l'effet machine à écrire, le bouton sert uniquement à afficher
    // immédiatement tout le texte. Il ne déclenche pas l'écran suivant.
    if (element.classList.contains('cut')) {
      const textWasCompleted = completeDialogueTextAnimation();
      element.classList.remove('cut');
      if (textWasCompleted) return;
    }

    if (locked || typeof action !== 'function') return;

    locked = true;
    element.classList.add('locked');
    element.setAttribute('aria-disabled', 'true');

    try {
      await action();
    } catch (error) {
      locked = false;
      element.classList.remove('locked');
      element.setAttribute('aria-disabled', 'false');
      console.error('[Dialogue] Échec de l’action utilisateur.', error);
    }
  };

  element.setAttribute('role', 'button');
  element.setAttribute('tabindex', '0');
  element.setAttribute('aria-disabled', 'false');
  element.addEventListener('click', activate);
  element.addEventListener('keydown', activate);
}

export function createDialogueContinue(dialogueFooter, {
  label = 'Continuer',
  onContinue
} = {}) {
  const dialogueContinue = document.createElement('div');
  dialogueContinue.className = 'dialogue-continue';
  ensureDialogueInteractionStyles();

  const labelElement = document.createElement('div');
  labelElement.className = 'label';
  labelElement.textContent = String(label);
  labelElement.style.cssText = [
    'margin-top: auto',
    'margin-bottom: auto',
    'display: flex',
    'justify-content: end'
  ].join(';');

  const icon = document.createElement('div');
  icon.className = 'dialogue-continue-icon';

  dialogueContinue.append(labelElement, icon);
  dialogueFooter.appendChild(dialogueContinue);
  bindDivAction(dialogueContinue, onContinue);

  return dialogueContinue;
}

function linkContinueButtonToTextAnimation(dialogueContinue, textAnimation) {
  if (!dialogueContinue || !activeDialogueTextAnimation) return;

  dialogueContinue.classList.add('cut');
  void textAnimation.finally(() => {
    dialogueContinue.classList.remove('cut');
  });
}

export function createDialoguePrevious(dialogueFooter, {
  label = 'Précédent',
  onPrevious
} = {}) {
  const dialoguePrevious = document.createElement('div');
  dialoguePrevious.className = 'dialogue-previous';

  const labelElement = document.createElement('div');
  labelElement.className = 'label';
  labelElement.textContent = String(label);

  const icon = document.createElement('div');
  icon.className = 'dialogue-previous-icon';

  dialoguePrevious.append(icon, labelElement);
  dialogueFooter.appendChild(dialoguePrevious);
  bindDivAction(dialoguePrevious, onPrevious);

  return dialoguePrevious;
}

function getChoiceConditionStats(condition) {
  if (!condition || typeof condition !== 'object') return [];

  const conditionGroups = [
    ['armyA', condition.armyA ?? condition.entity],
    ['armyB', condition.armyB]
  ];
  const stats = [];
  const seenKeys = new Set();

  for (const [army, requiredStats] of conditionGroups) {
    if (!requiredStats || typeof requiredStats !== 'object') continue;

    for (const [rawKey, minimum] of Object.entries(requiredStats)) {
      const key = String(rawKey ?? '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '-');
      if (!key || seenKeys.has(key)) continue;

      seenKeys.add(key);
      stats.push({ army, key, minimum });
    }
  }

  return stats;
}

function renderChoiceLabelContent(labelElement, choice) {
  const html = String(choice.text ?? '');
  const conditionStats = getChoiceConditionStats(choice.condition);

  if (conditionStats.length === 0) {
    labelElement.innerHTML = html;
    return;
  }

  const themedContent = document.createElement('span');
  themedContent.classList.add(
    'choice-dialogue',
    'condition-choice',
    ...conditionStats.map(({ key }) => key)
  );
  themedContent.dataset.conditionStats = conditionStats
    .map(({ key }) => key)
    .join(' ');

  for (const { army, key, minimum } of conditionStats) {
    const icon = document.createElement('span');
    icon.classList.add('picto-stat', key);
    icon.dataset.conditionArmy = army;
    icon.dataset.conditionMinimum = String(minimum);
    themedContent.appendChild(icon);
  }

  const text = document.createElement('span');
  text.className = 'choice-dialogue-text';
  text.innerHTML = html;
  themedContent.appendChild(text);
  labelElement.appendChild(themedContent);
}

export function createDialogueChoice(dialogueText, choice, {
  selectedChoiceId = null,
  readOnly = false,
  onChoice
} = {}) {
  ensureDialogueInteractionStyles();

  const choiceElement = document.createElement('div');
  const isSelected = String(selectedChoiceId || '') === String(choice.id);
  const isLocked = Boolean(selectedChoiceId) || readOnly;

  choiceElement.className = 'dialogue-choice';
  choiceElement.dataset.choiceId = String(choice.id);
  choiceElement.classList.toggle(
    'condition',
    Boolean(choice.condition && typeof choice.condition === 'object')
  );
  choiceElement.classList.toggle('selected', isSelected);
  choiceElement.classList.toggle('locked', isLocked);

  const labelElement = document.createElement('div');
  labelElement.className = 'label';
  // Les textes de choix proviennent des définitions locales d'événements et
  // peuvent contenir du balisage de présentation (pictogrammes, emphase, etc.).
  renderChoiceLabelContent(labelElement, choice);
  choiceElement.appendChild(labelElement);
  dialogueText.appendChild(choiceElement);

  if (isLocked) {
    choiceElement.setAttribute('role', 'button');
    choiceElement.setAttribute('tabindex', '-1');
    choiceElement.setAttribute('aria-disabled', 'true');
  } else {
    bindDivAction(choiceElement, () => onChoice?.(choice.id));
  }

  return choiceElement;
}

function normalizePortraitClass(value, fallback) {
  const className = String(value ?? fallback)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '-');
  return className || fallback;
}

export function createDialoguePortrait(view, portrait, nodeId) {
  if (!portrait || typeof portrait !== 'object') return null;

  const requestedSide = String(portrait.side || '').trim().toLowerCase();
  const side = requestedSide === 'a'
    ? 'A'
    : requestedSide === 'b'
      ? 'B'
      : 'Neutral';
  const type = normalizePortraitClass(portrait.type, 'sbire');
  const portraitId = normalizePortraitClass(portrait.id, nodeId || 'dialogue');
  const target = side === 'B' ? view.dialogueRight : view.dialogueLeft;

  const portraitContainer = document.createElement('div');
  portraitContainer.classList.add('portrait-container', type);

  const portraitCadre = document.createElement('div');
  portraitCadre.classList.add('portrait-cadre', side, type);

  const portraitSprite = document.createElement('img');
  portraitSprite.id = `portrait_${portraitId}`;
  portraitSprite.classList.add('portrait-sprite', `side-${side}`);
  portraitSprite.src = String(portrait.src || DEFAULT_PORTRAIT_SRC);
  portraitSprite.alt = String(portrait.alt || '');

  portraitContainer.append(portraitCadre, portraitSprite);
  target.appendChild(portraitContainer);
  return portraitContainer;
}

function createDialogueLoreImage(view, src) {
  const imageSrc = String(src ?? '').trim();
  if (!imageSrc) return null;

  const imageContainer = document.createElement('div');
  imageContainer.className = 'image-container';

  const image = document.createElement('img');
  image.src = imageSrc;
  image.className = 'dialogue-lore-image';
  image.alt = '';

  imageContainer.appendChild(image);
  view.dialogueLeft.appendChild(imageContainer);
  return imageContainer;
}

export function renderDialogueScreen(node, {
  selectedChoiceId = null,
  choicesReadOnly = false,
  animateText = true,
  animateChoices = true,
  onPrevious,
  onHistoryNext,
  onContinue,
  onChoice
} = {}) {
  if (!node || typeof node !== 'object') {
    throw new TypeError('renderDialogueScreen attend un écran de dialogue.');
  }

  cancelChoiceReveals();
  const view = dialogue('');
  if (!view) return null;

  eventChoiceAmbiant(node.type === 'choices');

  view.dialogueWindow.style.removeProperty('display');
  view.dialogueWindow.classList.add('active');
  window.dispatchEvent(new CustomEvent('battleActionContextChanged', {
    detail: { dialogueActive: true, reason: 'dialogue-opened' }
  }));
  clearDiv(view.dialogueHeader);
  clearDiv(view.dialogueFooter);
  clearDiv(view.dialogueLeft);
  clearDiv(view.dialogueRight);
  clearDiv(view.centerHeader);
  clearDiv(view.centerBody);
  clearDiv(view.centerFooter);
  clearDiv(view.dialogueUi);

  // replaceChildren() détache le texte : on le replace dans le body central.
  view.centerBody.appendChild(view.dialogueText);
  for (const choice of [...view.dialogueText.querySelectorAll(':scope > .dialogue-choice')]) {
    choice.remove();
  }

  createDialogueLoreImage(view, node.img);

  const textAnimation = typeDialogueText(view.loreText, node.text, {
    speed: animateText ? node.typewriterSpeed ?? TYPEWRITER_SPEED : 0
  });

  if (node.title) {
    const title = document.createElement('div');
    title.className = 'dialogue-title';
    const resultTone = node.outcome || node.choiceResult;
    if (
      ['success', 'middle', 'fail'].includes(resultTone)
    ) {
      title.classList.add('choice-result', resultTone);
    }
    title.textContent = String(node.title);
    view.dialogueHeader.appendChild(title);
  }

  if (node.image) {
    const image = document.createElement('div');
    image.className = 'dialogue-image';
    image.style.backgroundImage = `url(${JSON.stringify(String(node.image))})`;
    view.dialogueLeft.appendChild(image);
  }

  if (node.portrait) {
    createDialoguePortrait(view, node.portrait, node.id);
  }

  if (node.speech) {
    const speech = document.createElement('div');
    speech.className = 'dialogue-speech';
    speech.textContent = String(node.speech);
    view.centerBody.appendChild(speech);
  }

  if (node.type === 'choices') {
    const choiceElements = [];
    for (const choice of node.choices || []) {
      const choiceElement = createDialogueChoice(view.dialogueText, choice, {
        selectedChoiceId,
        readOnly: choicesReadOnly,
        onChoice
      });
      if (animateChoices) prepareDialogueChoiceFade(choiceElement);
      choiceElements.push(choiceElement);
    }
    if (animateChoices) {
      void textAnimation.then((completed) => {
        if (completed) {
          revealDialogueChoices(choiceElements, {
            initialDelay: node.choiceInitialDelay ?? CHOICE_FADE_INITIAL_DELAY,
            staggerDelay: node.choiceDelay ?? CHOICE_FADE_DELAY
          });
        }
      });
    }
  }

  if (typeof onPrevious === 'function') {
    createDialoguePrevious(view.dialogueFooter, { onPrevious });
  }

  if (typeof onHistoryNext === 'function') {
    const dialogueContinue = createDialogueContinue(view.dialogueFooter, {
      onContinue: onHistoryNext
    });
    linkContinueButtonToTextAnimation(dialogueContinue, textAnimation);
  } else if (
    node.type !== 'choices'
    && (node.next || typeof onContinue === 'function')
  ) {
    const dialogueContinue = createDialogueContinue(view.dialogueFooter, { onContinue });
    linkContinueButtonToTextAnimation(dialogueContinue, textAnimation);
  }

  return view;
}

export function closeDialogue({ remove = false } = {}) {
  const dialogueWindow = document.querySelector('#game-windows > .dialogue-window');
  if (!dialogueWindow) return false;

  cancelDialogueTextAnimation();
  cancelChoiceReveals();
  eventChoiceAmbiant(false);
  if (remove) {
    dialogueWindow.remove();
    window.dispatchEvent(new CustomEvent('battleActionContextChanged', {
      detail: { dialogueActive: false, reason: 'dialogue-removed' }
    }));
    return true;
  }

  dialogueWindow.classList.remove('active');
  dialogueWindow.style.display = 'none';
  const dialogueUi = dialogueWindow.querySelector(':scope > .dialogue-ui');
  clearDiv(dialogueUi);
  window.dispatchEvent(new CustomEvent('battleActionContextChanged', {
    detail: { dialogueActive: false, reason: 'dialogue-closed' }
  }));
  return true;
}
