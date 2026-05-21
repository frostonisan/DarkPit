import { saveUpgradedEntity } from './GameStorage.js';

/// Blacklist des mots interdits
const blacklist = [
    // Insultes générales
    "connard", "connasse", "mongol", "autiste", "putin", "putain", "pute", "salope", "fils de pute", "merde", "nique", "niquer", "batard", "salaud", "bouffon",
    "trou du cul", "encule", "enculeur", "tapette", "fiotte", "branleur", "branleuse", "gouine", "pede", "pd",
    "tarlouze", "petasse", "pouffiasse", "trainée", "clito", "chatte", "chate", "vagin", "anus", "sperme", "cul", "bite",
    "couille", "zob", "teub", "branlette", "branler", "branleurs", "va te faire foutre", "ferme ta gueule", "sodo", "fellation","sodomie","faciale","ejac","ejaculation","branlette","woke","wokism",

    // Insultes racistes et ethniques
    "negre", "negro", "nigger", "sale noir", "sale arabe", "bougnoule", "roumi", "youpin", "chinetok", "chinetoque",
    "chink", "gook", "jap", "kike", "wetback", "spic", "honky", "cracker", "white trash", "sand nigger", "camel jockey",
    "paki", "curry muncher", "rice nigger", "yellow peril", "jungle bunny", "macaque", "singe", "bamboula", "babtou", "boloss", "chocolat", "racaille", "wog",

    // Insultes sexistes
    "pute", "salope", "trainee", "gouine", "tapette", "pouffiasse", "bimbo", "grognasse", "bite", "vagin", "anal",
    "enculeur", "branleuse", "zob", "porn", "porno", "gangbang", "bukkake", "hentai", "doggystyle", "camgirl",

    // Insultes religieuses
    "dieu", "allah", "jesus", "mahomet", "prophete", "chretien", "catholique", "juif", "muslim", "islam", "musluman",
    "youpin", "jude", "boudha", "atheiste", "infidele", "mecreant", "idolatre",

    // Insultes politiques
    "hitler", "goebbels", "mussolini", "staline", "poutine", "trump", "macron", "kimjongun", "fasciste", "dictateur",
    "aryen", "ku klux klan", "kkk", "suprémaciste", "nazi", "nazis", "esclave", "klan", "white power", "skinhead",
    "dictature", "rapist", "viol",

    // Insultes et termes vulgaires en anglais
    "fuck", "fucker", "motherfucker", "shit", "bitch", "cunt", "asshole", "dickhead", "twat", "bollocks", "prick",
    "wanker", "tosser", "slut", "whore", "dumbass", "jackass", "loser", "basement dweller", "neckbeard", "simp",
    "cuck", "soyboy", "beta", "virgin", "incel", "femcel", "stfu", "kys", "kill yourself", "autistic screeching",

    // Insultes racistes en anglais
    "nigger", "wetback", "spic", "sand nigger", "camel jockey", "chink", "gook", "jap", "rice nigger", "paki",
    "towelhead", "house nigger", "field nigger", "massa", "overseer", "plantation", "slaver", "yellow peril",

    // Langage internet offensant
    "cringe", "edgelord", "shitposter", "troll", "4channer", "meme lord", "cancer", "autism", "virgin loser",
    "basement dweller", "simp cuck", "beta male", "incel simp", "toxic",

    // Mots liés au viol ou à l'exploitation
    "rape", "rapist", "viol", "violeur", "pedo", "pedophile", "child fucker", "child molester", "groomer",
    "petite fille", "petit garcon", "child abuser", "baby raper", "baby fucker",

    // Langage raciste détourné
    "kung flu", "chinese virus", "wuhan virus", "bat eater", "dog eater", "rice eater", "corona spreader",
    "wetback", "immigrant scum",

    // Autres termes offensants divers
    "anal", "porn", "porno", "bukkake", "doggystyle", "camgirl", "escort", "whorehouse", "stripper",
    "escort girl", "prostitute", "hooker", "brothel", "massage parlor"
];


// Précompilation de la regex
const blacklistRegex = new RegExp(
    blacklist.map((word) => `(${word})`).join("|"), // Retrait des ancres de mot
    "gi"
);

// Fonction pour valider et définir un surnom
export function validateAndSetNickname(entite, nicknameInput, currentNickname) {
    const maxCharacters = 55;
    const validNicknameRegex = /^[a-zA-Z ]+$/; // Lettres et espaces uniquement
    const rawInput = nicknameInput.value.trim().toLowerCase();

    // Vérification des règles générales
    if (
        rawInput.length > maxCharacters || 
        !validNicknameRegex.test(rawInput) || 
        /<[^>]*>/.test(rawInput)
    ) {
        showInvalidNicknamePopup(nicknameInput, "Surnom non valide !");
        return false;
    }

    // Vérification des mots interdits
    if (containsBlacklistedWords(rawInput)) {
        showInvalidNicknamePopup(nicknameInput, "L'Entité n'aime pas ce surnom...");
        return false;
    }

    // Vérification des mots similaires (uniquement si le mot est suffisamment long)
    if (rawInput.length >= 4 && isSimilarToBlacklist(rawInput, blacklist)) {
        showInvalidNicknamePopup(nicknameInput, "Votre Entité ne mérite pas ça !");
        return false;
    }

    // Si tout est valide
    entite.nickname = rawInput;
    saveUpgradedEntity(entite);
    currentNickname.textContent = rawInput;
    console.log(`Le surnom de l'entité ID ${entite.id} a été défini à : "${rawInput}"`);
    return true;
}

// Fonction pour vérifier si un mot contient des mots interdits
function containsBlacklistedWords(input) {
    const sanitizedInput = input.toLowerCase();

    // Vérifier la blacklist uniquement pour des mots de longueur >= 3
    const words = sanitizedInput.split(/\s+/);
    for (const word of words) {
        if (word.length < 3) {
            continue; // Ignorer les mots très courts
        }

        // Vérifier contre la blacklist
        if (blacklistRegex.test(word)) {
            return true;
        }
    }

    return false;
}

// Fonction pour vérifier la similarité avec des mots de la blacklist
function isSimilarToBlacklist(word, blacklist) {
    const normalizedWord = normalizeWord(word);
    const threshold = 2; // Distance maximale tolérée pour les mots longs
    for (const forbiddenWord of blacklist) {
        const normalizedForbiddenWord = normalizeWord(forbiddenWord);
        if (levenshteinDistance(normalizedWord, normalizedForbiddenWord) <= threshold) {
            return true;
        }
    }
    return false;
}

function normalizeWord(word) {
    return word.replace(/(.)\1+/g, "$1"); // Normalisation des doublons
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            matrix[i][j] = a[i - 1] === b[j - 1]
                ? matrix[i - 1][j - 1]
                : Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]) + 1;
        }
    }
    return matrix[a.length][b.length];
}

function showInvalidNicknamePopup(inputElement, message) {
    let popup = document.createElement("div");
    popup.className = "nickname-error-popup";
    popup.textContent = message;

    const rect = inputElement.getBoundingClientRect();
    popup.style.position = "absolute";
    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.backgroundColor = "red";
    popup.style.color = "white";
    popup.style.padding = "5px 10px";
    popup.style.borderRadius = "5px";
    popup.style.zIndex = "1000";

    document.body.appendChild(popup);
    setTimeout(() => popup.remove(), 3000);
}
