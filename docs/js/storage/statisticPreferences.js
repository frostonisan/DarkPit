// User interface preferences, independent of saved entities and temporary admin
// game data. Read on UI refresh (no cache); write only on an explicit UI choice.
const DEFAULT_KEY = 'umbraCalculationDetailsVisible';
const CHOICES_KEY = 'statisticCalculationChoices';
const MAX_CHOICES = 2048;
export function readStatisticCalculationPreferences() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CHOICES_KEY) || '{}');
    const choices = Object.fromEntries(Object.entries(parsed && typeof parsed === 'object' ? parsed : {})
      .filter(([key, value]) => key.length <= 240 && typeof value === 'boolean').slice(-MAX_CHOICES));
    return { expanded: window.localStorage.getItem(DEFAULT_KEY) === 'true', choices };
  } catch { return { expanded: false, choices: {} }; }
}
export function statisticCalculationChoiceKey(stat, effect, calculation) {
  // Stable across entities, windows and reconstructed cards; no DOM/instance ID.
  return JSON.stringify([stat, effect || '', calculation]);
}
export function saveStatisticCalculationChoice(key, expanded) {
  const preferences = readStatisticCalculationPreferences();
  delete preferences.choices[key];
  preferences.choices[key] = Boolean(expanded);
  try {
    window.localStorage.setItem(CHOICES_KEY, JSON.stringify(Object.fromEntries(Object.entries(preferences.choices).slice(-MAX_CHOICES))));
  } catch { /* An unavailable store must not prevent toggling the current card. */ }
}
export function saveStatisticCalculationDefault(expanded) {
  try {
    window.localStorage.setItem(DEFAULT_KEY, String(Boolean(expanded)));
    window.localStorage.removeItem(CHOICES_KEY);
  } catch { /* Keep the current interaction usable if storage is unavailable. */ }
}
