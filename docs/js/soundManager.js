import { saveToLocalStorage, loadFromLocalStorage, soundSettings } from './GameStorage.js';

export function createSoundControls(settingsMenu) {
    const soundControls = document.createElement('div');
    soundControls.className = 'sound-controls';

    // Charger les réglages depuis le localStorage ou les valeurs par défaut
    let { isMuted, volume } = loadFromLocalStorage('soundSettings', soundSettings);

    // Création de la div pour le bouton mute/unmute
    const muteIcon = document.createElement('div');
    muteIcon.className = `sound-control-button ${isMuted ? 'mute' : 'unmute'}`;
    muteIcon.onclick = () => {
        isMuted = !isMuted; // Inverser l'état de mute

        // Met à jour et sauvegarde l'état de mute dans le localStorage
        saveToLocalStorage('soundSettings', { isMuted, volume });
        muteIcon.classList.toggle('mute', isMuted);
        muteIcon.classList.toggle('unmute', !isMuted);
        volumeSlider.style.opacity = isMuted ? '0.6' : '1';

        // Appliquer le nouvel état de mute à l'élément audio
        const audioElement = document.querySelector('.sound-controls .biome-sound');
        if (audioElement) {
            audioElement.muted = isMuted;
        }
    };
    soundControls.appendChild(muteIcon);

    // Création du slider de volume
    const volumeSlider = document.createElement('input');
    volumeSlider.className = 'sound-volume';
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.01';
    volumeSlider.value = volume;
    volumeSlider.style.opacity = isMuted ? '0.6' : '1';

    // Gère la modularité et les ajustements du volume
    volumeSlider.oninput = (event) => {
        volume = parseFloat(event.target.value); // Mettre à jour le volume

        // Met à jour et sauvegarde le volume dans le localStorage
        saveToLocalStorage('soundSettings', { isMuted, volume });

        const audioElement = document.querySelector('.sound-controls .biome-sound');
        if (audioElement) {
            audioElement.volume = volume;
        }

        // Mise à jour de l'état mute/unmute en fonction du volume
        if (volume === 0) {
            isMuted = true;
            muteIcon.classList.add('mute');
            muteIcon.classList.remove('unmute');
            volumeSlider.style.opacity = '0.6';
            if (audioElement) audioElement.muted = true;
        } else {
            isMuted = false;
            muteIcon.classList.add('unmute');
            muteIcon.classList.remove('mute');
            volumeSlider.style.opacity = '1';
            if (audioElement) audioElement.muted = false;
        }
    };
    soundControls.appendChild(volumeSlider);

    settingsMenu.appendChild(soundControls);
}


export function createSoundManager(soundSrc) {
    const soundControls = document.querySelector('.sound-controls');
    if (!soundControls) return; // Ne fait rien si .sound-controls n'existe pas

    const { isMuted, volume } = loadFromLocalStorage('soundSettings', soundSettings);

    let audioElement = soundControls.querySelector('.biome-sound');
    if (!audioElement) {
        audioElement = document.createElement('audio');
        audioElement.className = 'biome-sound';
        audioElement.loop = true;
        audioElement.autoplay = true;

        // Applique le volume et le mute sauvegardés immédiatement lors de la création
        audioElement.volume = volume;
        audioElement.muted = isMuted;

        soundControls.appendChild(audioElement);
    }

    if (soundSrc) {
        audioElement.src = soundSrc;
    }

    return audioElement;
}
