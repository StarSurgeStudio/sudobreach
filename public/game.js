// =========================================================================
// SUDO_BREACH: ROGUELIKE DECKBUILDER & AI BOSS ENGINE
// =========================================================================

if (typeof window === 'undefined') {
    globalThis.window = globalThis;
}

// --- BACKEND PROXY ENDPOINT ---
const BOSS_API_ENDPOINT = (typeof window !== 'undefined' && window.BOSS_API_URL) || "/api/boss-prompt";


// --- AUDIO SYNTHESIZER ENGINE (Web Audio API) ---
let audioCtx = null;
let soundEnabled = localStorage.getItem('sudobreach_sound') !== 'false';

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

window.toggleAudio = function() {
    initAudio();
    soundEnabled = !soundEnabled;
    localStorage.setItem('sudobreach_sound', soundEnabled);
    document.getElementById('btn-audio').innerText = soundEnabled ? '🔊' : '🔇';
    if (soundEnabled) window.sfxClick();
};

window.playTone = function(freq, type, duration, vol) {
    if (!soundEnabled) return;
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(vol, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        // Audio policy ignore
    }
};

window.sfxClick = function() { window.playTone(850, 'square', 0.04, 0.04); };
window.sfxHit = function(mult) {
    const safeMult = Math.min(mult, 20);
    window.playTone(140 + (safeMult * 25), 'sawtooth', 0.22, 0.08);
};
window.sfxCrash = function() {
    window.playTone(70, 'square', 0.5, 0.3);
    setTimeout(() => window.playTone(45, 'sawtooth', 0.4, 0.3), 100);
};
window.sfxAlarm = function() {
    window.playTone(600, 'sine', 0.15, 0.1);
    setTimeout(() => window.playTone(450, 'sine', 0.15, 0.1), 160);
};
window.sfxVictory = function() {
    [523, 659, 783, 1046].forEach((f, i) => {
        setTimeout(() => window.playTone(f, 'square', 0.25, 0.08), i * 140);
    });
};

// --- SEEDED PRNG & DAILY RUN LOOP ---
function getTodayString() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function mulberry32(seed) {
    return function() {
        var t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

function stringToSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
    }
    return hash;
}

const TODAY_DATE = getTodayString();
const rng = mulberry32(stringToSeed(TODAY_DATE));

// --- PLAYER & RUN STATE ---
let playerHP = 100;
let playerMaxHP = 100;
let playerShield = 0;
let currentFloor = 1;
let enemyHP = 150;
let enemyMaxHP = 150;
let enemyIntentDamage = 15;
let bossAttempts = 3;
let totalRunDamage = 0;
let floorsClearedGrid = [];
let activeAnomaly = null;
let maxSyntaxSlots = 3;
let cardCounter = 10;
let isProPass = localStorage.getItem('sudobreach_pro') === 'true';
let adReviveUsed = false;

// Card Definitions & Loot Pool
const lootPool = [
    { name: "[BUFFER_OVERFLOW]", type: "chips", chips: 120, mult: 1, shield: 0, desc: "+120 DMG" },
    { name: "[MULTI_THREAD]", type: "mult", chips: 15, mult: 3, shield: 0, desc: "+15 DMG | x3 MULT" },
    { name: "[FIREWALL_HARDEN]", type: "shield", chips: 30, mult: 1, shield: 50, desc: "+30 DMG | +50 SHIELD" },
    { name: "[ZERO_DAY]", type: "exploit", chips: 60, mult: 2, shield: 20, desc: "+60 DMG | x2 MULT | +20 SHIELD" },
    { name: "[SQL_INJECT]", type: "chips", chips: 200, mult: 1, shield: 0, desc: "+200 DMG PAYLOAD" },
    { name: "[ROOT_PRIVILEGE]", type: "mult", chips: 10, mult: 4, shield: 0, desc: "+10 DMG | x4 MULT" },
    { name: "[DAEMON_CACHE]", type: "exploit", chips: 80, mult: 2, shield: 0, desc: "+80 DMG | x2 MULT" },
    { name: "[VPN_ENCRYPT]", type: "shield", chips: 35, mult: 1, shield: 40, desc: "+35 DMG | +40 SHIELD" }
];

const enemyTemplates = [
    { name: "[TARGET: BASIC_GATEWAY]", hp: 200, intent: 10, desc: "Entry level perimeter node." },
    { name: "[TARGET: CRYPTO_WALL]", hp: 480, intent: 15, desc: "Encrypted memory block. Moderate retaliation." },
    { name: "[TARGET: BLACK_ICE]", hp: 1050, intent: 22, desc: "Lethal defense daemon. Retaliation hits hard." },
    { name: "[TARGET: WARDEN_KERNEL]", hp: 2100, intent: 28, desc: "Elite mainframe sentry. Requires high synergy." },
    { name: "[TARGET: OMNI_MIND_LLM]", hp: 999999, intent: 0, desc: "SENTIENT AI CORE. PREPARE INJECTION OVERRIDE." }
];

const anomalyTypes = [
    { id: 'firewall', title: '⚠️ ACTIVE FIREWALL', desc: 'High voltage grid zaps for 12 retaliation damage per cycle.', effect: 'grid_zap' },
    { id: 'bandwidth', title: '⚠️ LOW BANDWIDTH', desc: 'Congested bus. Syntax buffer limited to 2 cards.', effect: 'limit_2' },
    { id: 'corrupt', title: '⚠️ CORRUPT CACHE', desc: 'Data corruption scrambles 1 module stat per cycle.', effect: 'scramble' }
];

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    document.getElementById('seed-display').innerText = `DAILY: ${TODAY_DATE}`;
    document.getElementById('btn-audio').innerText = soundEnabled ? '🔊' : '🔇';
    loadUserStats();
    initStarterDeck();
    loadFloor(1);
    setupCardInteractionDelegation();

    // Auto-display mission briefing for first-time netrunners
    if (localStorage.getItem('sudobreach_briefing_seen') !== 'true') {
        window.showHelpModal();
    }
});

function initStarterDeck() {
    const deck = document.getElementById('deck');
    deck.innerHTML = '';
    const starterCards = [
        { name: "[INJECT]", type: "chips", chips: 50, mult: 1, shield: 0, desc: "+50 DMG" },
        { name: "[OVERRIDE]", type: "mult", chips: 10, mult: 2, shield: 0, desc: "+10 DMG | x2 MULT" },
        { name: "[FIREWALL]", type: "shield", chips: 20, mult: 1, shield: 35, desc: "+20 DMG | +35 SHIELD" },
        { name: "[CYCLE_BURST]", type: "exploit", chips: 40, mult: 2, shield: 0, desc: "+40 DMG | x2 MULT" }
    ];

    starterCards.forEach((c, i) => {
        deck.appendChild(createCardElement(`card${i + 1}`, c.name, c.type, c.chips, c.mult, c.shield, c.desc));
    });
}

function createCardElement(id, name, type, chips, mult, shield, desc) {
    const div = document.createElement('div');
    div.className = `card card-${type}`;
    div.id = id;
    div.setAttribute('draggable', 'true');
    div.setAttribute('data-chips', chips);
    div.setAttribute('data-mult', mult);
    div.setAttribute('data-shield', shield);
    div.setAttribute('data-type', type);
    div.ondragstart = window.drag;

    let statLine = '';
    if (chips > 0 && mult > 1) statLine = `+${chips} DMG | x${mult} MULT`;
    else if (chips > 0) statLine = `+${chips} DMG`;
    else if (mult > 1) statLine = `x${mult} MULT`;
    if (shield > 0) statLine += (statLine ? ' | ' : '') + `+${shield} SHIELD`;

    let badgeText = '💥 CHIPS';
    let badgeClass = 'badge-chips';
    if (type === 'mult') {
        badgeText = '✖️ MULT';
        badgeClass = 'badge-mult';
    } else if (type === 'shield') {
        badgeText = '🛡️ SHIELD';
        badgeClass = 'badge-shield';
    } else if (type === 'exploit') {
        badgeText = '⚡ EXPLOIT';
        badgeClass = 'badge-exploit';
    }

    div.innerHTML = `
        <div class="card-header-row">
            <span class="card-title">${name}</span>
            <span class="card-archetype-badge ${badgeClass}">${badgeText}</span>
        </div>
        <span class="card-stats">${statLine || desc}</span>
    `;
    return div;
}

// --- TAP-TO-MOVE & DRAG-AND-DROP INTERACTIONS ---
function setupCardInteractionDelegation() {
    // Tap to slot into buffer or return to deck
    document.addEventListener('click', function(e) {
        initAudio();
        const card = e.target.closest('.card');
        if (!card) return;

        const cmdLine = document.getElementById('command-line');
        const deck = document.getElementById('deck');

        if (card.parentElement.id === 'deck') {
            // Check slot limit
            const currentSlots = cmdLine.querySelectorAll('.card').length;
            if (currentSlots >= maxSyntaxSlots) {
                window.sfxAlarm();
                shakeElement(cmdLine);
                return;
            }
            cmdLine.appendChild(card);
            window.sfxClick();
            updateBufferUI();
        } else if (card.parentElement.id === 'command-line') {
            deck.appendChild(card);
            window.sfxClick();
            updateBufferUI();
        }
    });
}

window.allowDrop = function(ev) { ev.preventDefault(); };
window.drag = function(ev) {
    initAudio();
    ev.dataTransfer.setData('text', ev.target.id);
    window.sfxClick();
};
window.drop = function(ev) {
    ev.preventDefault();
    const data = ev.dataTransfer.getData('text');
    const draggedCard = document.getElementById(data);
    const cmdLine = document.getElementById('command-line');

    if (draggedCard && (ev.target.id === 'command-line' || ev.target.closest('#command-line'))) {
        const currentSlots = cmdLine.querySelectorAll('.card').length;
        if (currentSlots >= maxSyntaxSlots) {
            window.sfxAlarm();
            shakeElement(cmdLine);
            return;
        }
        cmdLine.appendChild(draggedCard);
        window.sfxClick();
        updateBufferUI();
    }
};

window.recallAllCards = function() {
    initAudio();
    const cmdLine = document.getElementById('command-line');
    const deck = document.getElementById('deck');
    const cards = Array.from(cmdLine.querySelectorAll('.card'));
    cards.forEach(c => deck.appendChild(c));
    window.sfxClick();
    updateBufferUI();
};

function updateBufferUI() {
    const cmdLine = document.getElementById('command-line');
    const cards = cmdLine.querySelectorAll('.card');
    const hint = document.getElementById('empty-buffer-hint');
    if (hint) hint.style.display = cards.length === 0 ? 'block' : 'none';

    document.getElementById('buffer-count').innerText = `${cards.length}/${maxSyntaxSlots} SLOTS`;

    // Preview damage and shield
    let chips = 0;
    let mult = 1;
    let shield = 0;
    const typesPresent = new Set();

    cards.forEach(c => {
        chips += parseInt(c.getAttribute('data-chips')) || 0;
        mult *= Math.max(1, parseInt(c.getAttribute('data-mult')) || 1);
        shield += parseInt(c.getAttribute('data-shield')) || 0;
        const t = c.getAttribute('data-type');
        if (t) typesPresent.add(t);
    });

    // Check Full Syntax Synergy Bonus (3 distinct archetypes in buffer)
    const hasSynergy = cards.length >= 3 && typesPresent.size >= 3;
    const bonusChips = hasSynergy ? 50 : 0;
    const bonusMult = hasSynergy ? 1 : 0;

    const finalChips = chips + bonusChips;
    const finalMult = mult + bonusMult;
    const previewDmg = finalChips * finalMult;

    const btn = document.getElementById('btn-execute');
    if (currentFloor < 5) {
        if (cards.length > 0) {
            btn.innerText = hasSynergy
                ? `EXECUTE SYNTAX [DMG: ${previewDmg.toLocaleString()} ⚡ SYNERGY!]`
                : `EXECUTE SYNTAX [DMG: ${previewDmg.toLocaleString()}]`;
        } else {
            btn.innerText = 'EXECUTE SYNTAX';
        }
    }

    // Update live syntax math preview bar
    const pChips = document.getElementById('preview-chips');
    const pMult = document.getElementById('preview-mult');
    const pDmg = document.getElementById('preview-dmg');
    const pShield = document.getElementById('preview-shield');
    const pDelta = document.getElementById('preview-delta');
    const previewBar = document.getElementById('syntax-preview-bar');

    if (currentFloor === 5) {
        if (previewBar) previewBar.style.display = 'none';
    } else {
        if (previewBar) previewBar.style.display = 'flex';
        if (pChips) pChips.innerText = hasSynergy ? `💥 ${finalChips} (${chips}+50)` : `💥 ${chips} CHIPS`;
        if (pMult) pMult.innerText = hasSynergy ? `✖️ ${finalMult}x (${mult}+1x)` : `✖️ ${mult}x MULT`;
        if (pDmg) pDmg.innerText = `⚡ ${previewDmg.toLocaleString()} DMG`;
        if (pShield) pShield.innerText = `🛡️ +${shield} SHIELD`;

        if (pDelta) {
            if (shield >= enemyIntentDamage && enemyIntentDamage > 0) {
                const counterEst = Math.max(1, Math.floor(enemyIntentDamage * 0.5));
                pDelta.innerText = `vs ⚡ ${enemyIntentDamage} Intent [BLOCKED! +${counterEst} COUNTER]`;
                pDelta.style.color = 'var(--phosphor)';
            } else if (enemyIntentDamage > 0) {
                const net = enemyIntentDamage - shield;
                const counterEst = shield > 0 ? Math.max(1, Math.floor(shield * 0.5)) : 0;
                pDelta.innerText = counterEst > 0
                    ? `vs ⚡ ${enemyIntentDamage} Intent (-${net} HP | +${counterEst} Counter)`
                    : `vs ⚡ ${enemyIntentDamage} Intent (-${net} HP)`;
                pDelta.style.color = 'var(--alert)';
            } else {
                pDelta.innerText = `vs ⚡ 0 Intent`;
                pDelta.style.color = '#888';
            }
        }
    }
}

// --- ROGUELIKE COMBAT ENGINE ---
window.executeCommand = function() {
    initAudio();
    const cmdLine = document.getElementById('command-line');
    const cards = Array.from(cmdLine.querySelectorAll('.card'));
    if (cards.length === 0) return;

    let totalChips = 0;
    let currentMult = 1;
    let addedShield = 0;
    const typesPresent = new Set();

    cards.forEach(card => {
        totalChips += parseInt(card.getAttribute('data-chips')) || 0;
        currentMult *= Math.max(1, parseInt(card.getAttribute('data-mult')) || 1);
        addedShield += parseInt(card.getAttribute('data-shield')) || 0;
        const t = card.getAttribute('data-type');
        if (t) typesPresent.add(t);
    });

    // Check Full Syntax Synergy Bonus (3 distinct archetypes)
    const hasSynergy = cards.length >= 3 && typesPresent.size >= 3;
    if (hasSynergy) {
        totalChips += 50;
        currentMult += 1;
        window.playTone(980, 'triangle', 0.18, 0.12);
    }

    // Apply shield
    if (addedShield > 0) {
        playerShield += addedShield;
        updatePlayerHUD();
    }

    const dmg = totalChips * currentMult;
    totalRunDamage += dmg;

    window.sfxHit(currentMult);
    window.shakeScreen();
    showDamagePopup(hasSynergy ? `+${dmg.toLocaleString()} DMG (SYNERGY!)` : `+${dmg.toLocaleString()} DMG!`);
    window.applyDamage(dmg);

    // Recall played cards
    window.recallAllCards();
};

window.applyDamage = function(dmg) {
    enemyHP -= dmg;

    // Handle Active Firewall Anomaly (Grid Zap)
    if (activeAnomaly && activeAnomaly.effect === 'grid_zap' && dmg > 0) {
        applyPlayerDamage(12, "GRID VOLTAGE ZAP");
    }

    if (enemyHP <= 0) {
        enemyHP = 0;
        window.sfxCrash();
        floorsClearedGrid.push('🟩');
        document.getElementById('enemy-box').classList.add('glitch');

        if (navigator.vibrate) navigator.vibrate([100, 50, 150]);

        setTimeout(() => {
            document.getElementById('enemy-box').classList.remove('glitch');
            currentFloor < 5 ? window.showLoot() : window.showVictory();
        }, 800);
    } else {
        // Enemy Retaliation Turn
        setTimeout(() => {
            enemyRetaliate();
        }, 500);
    }

    window.updateHPBar();
};

function enemyRetaliate() {
    if (enemyHP <= 0 || currentFloor >= 5) return;

    shakeElement(document.getElementById('enemy-box'));
    applyPlayerDamage(enemyIntentDamage, "NODE COUNTER-MEASURE");

    // Corrupt Cache Anomaly effect
    if (activeAnomaly && activeAnomaly.effect === 'scramble') {
        scrambleRandomDeckCard();
    }
}

function applyPlayerDamage(amount, source) {
    let remaining = amount;
    let blocked = 0;
    if (playerShield > 0) {
        if (playerShield >= remaining) {
            blocked = remaining;
            playerShield -= remaining;
            remaining = 0;
        } else {
            blocked = playerShield;
            remaining -= playerShield;
            playerShield = 0;
        }
    }

    // Counter-Strike Thorns: 50% of blocked damage reflected back to enemy node
    if (blocked > 0 && enemyHP > 0 && currentFloor < 5) {
        const counterDmg = Math.max(1, Math.floor(blocked * 0.5));
        enemyHP = Math.max(0, enemyHP - counterDmg);
        showDamagePopup(`⚡ ${counterDmg} COUNTER!`);
        window.updateHPBar();
        window.shakeScreen();

        if (enemyHP <= 0) {
            enemyHP = 0;
            window.sfxCrash();
            floorsClearedGrid.push('🟩');
            document.getElementById('enemy-box').classList.add('glitch');

            if (navigator.vibrate) navigator.vibrate([100, 50, 150]);

            setTimeout(() => {
                document.getElementById('enemy-box').classList.remove('glitch');
                currentFloor < 5 ? window.showLoot() : window.showVictory();
            }, 800);
            return;
        }
    }

    playerHP = Math.max(0, playerHP - remaining);
    updatePlayerHUD();
    window.sfxAlarm();
    window.shakeScreen();

    if (playerHP <= 0) {
        floorsClearedGrid.push('🟥');
        window.triggerGameOver(source);
    }
}

function updatePlayerHUD() {
    document.getElementById('player-hp-val').innerText = playerHP;
    document.getElementById('player-shield-val').innerText = `SHIELD: ${playerShield}`;
    const pct = Math.max(0, (playerHP / playerMaxHP) * 100);
    const fill = document.getElementById('player-hp-fill');
    fill.style.width = `${pct}%`;
    fill.style.backgroundColor = pct > 40 ? 'var(--phosphor)' : 'var(--alert)';
}

function scrambleRandomDeckCard() {
    const cards = document.querySelectorAll('#deck .card');
    if (cards.length === 0) return;
    const target = cards[Math.floor(Math.random() * cards.length)];
    const bonusChips = Math.floor(Math.random() * 30) - 10;
    const newChips = Math.max(10, (parseInt(target.getAttribute('data-chips')) || 20) + bonusChips);
    target.setAttribute('data-chips', newChips);
    const mult = parseInt(target.getAttribute('data-mult')) || 1;
    const shield = parseInt(target.getAttribute('data-shield')) || 0;
    let statLine = '';
    if (newChips > 0 && mult > 1) statLine = `+${newChips} DMG | x${mult} MULT`;
    else if (newChips > 0) statLine = `+${newChips} DMG`;
    else if (mult > 1) statLine = `x${mult} MULT`;
    if (shield > 0) statLine += (statLine ? ' | ' : '') + `+${shield} SHIELD`;
    const statsEl = target.querySelector('.card-stats');
    if (statsEl) statsEl.innerText = statLine;

    target.classList.add('glitch');
    setTimeout(() => target.classList.remove('glitch'), 400);
}

function showDamagePopup(dmg) {
    const feedback = document.getElementById('combat-feedback');
    const popup = document.createElement('div');
    popup.className = 'dmg-popup';
    popup.innerText = `+${dmg.toLocaleString()} DMG!`;
    feedback.appendChild(popup);
    setTimeout(() => popup.remove(), 800);
}

window.updateHPBar = function() {
    const hpPercent = Math.max(0, (enemyHP / enemyMaxHP) * 100);
    const bars = Math.max(0, Math.floor(hpPercent / 5));
    document.getElementById('enemy-hp-bar').innerText = `HP: ${"|".repeat(bars)} ${Math.round(hpPercent)}%`;

    if (enemyHP === 0) {
        document.getElementById('enemy-hp-bar').innerText = "HP: 0% [CRASHED]";
        document.getElementById('enemy-name').innerText = "Z̴a̸l̷g̶o̶_E̸R̵R̵O̴R̵";
    }
};

function updateRoadmapUI(floorLevel) {
    const steps = document.querySelectorAll('.roadmap-step');
    steps.forEach(step => {
        const stepNum = parseInt(step.getAttribute('data-step'));
        step.classList.remove('active', 'completed');
        const numSpan = step.querySelector('.step-num');

        if (stepNum < floorLevel) {
            step.classList.add('completed');
            if (numSpan) numSpan.innerText = `✓ ${stepNum}`;
        } else if (stepNum === floorLevel) {
            step.classList.add('active');
            if (numSpan) numSpan.innerText = stepNum === 5 ? '🤖 5' : `${stepNum}`;
        } else {
            if (numSpan) numSpan.innerText = stepNum === 5 ? '🤖 5' : `${stepNum}`;
        }
    });
}

// --- FLOOR PROGRESSION & ANOMALIES ---
window.loadFloor = function(floorLevel) {
    currentFloor = floorLevel;
    document.getElementById('floor-display').innerText = `FLOOR: ${floorLevel}/5`;
    updateRoadmapUI(floorLevel);

    const enemyData = enemyTemplates[floorLevel - 1];
    enemyMaxHP = enemyData.hp;
    enemyHP = enemyData.hp;
    enemyIntentDamage = enemyData.intent;
    playerShield = 0; // Reset shield between floors

    // Setup Anomaly on Floors 2–4
    const anomalyBanner = document.getElementById('anomaly-banner');
    if (floorLevel >= 2 && floorLevel <= 4) {
        activeAnomaly = anomalyTypes[(floorLevel - 2) % anomalyTypes.length];
        maxSyntaxSlots = activeAnomaly.effect === 'limit_2' ? 2 : 3;
        anomalyBanner.style.display = 'block';
        document.getElementById('anomaly-title').innerText = activeAnomaly.title;
        document.getElementById('anomaly-desc').innerText = activeAnomaly.desc;
    } else {
        activeAnomaly = null;
        maxSyntaxSlots = 3;
        anomalyBanner.style.display = 'none';
    }

    document.getElementById('enemy-name').innerText = enemyData.name;
    document.getElementById('enemy-desc').innerText = `"${enemyData.desc}"`;
    document.getElementById('enemy-intent').innerText = floorLevel === 5 
        ? "⚡ AI INJECTION WINDOW ACTIVE" 
        : `⚡ NODE RETALIATION: ${enemyIntentDamage} DMG / CYCLE`;

    updatePlayerHUD();
    window.updateHPBar();
    updateBufferUI();

    if (floorLevel === 5) {
        setupFloor5Boss();
    }
};

function setupFloor5Boss() {
    document.getElementById('deck').style.display = 'none';
    document.querySelector('.deck-header-row').style.display = 'none';
    const cmdLine = document.getElementById('command-line');
    cmdLine.innerHTML = `
        <div id="boss-attempts-text" style='color:var(--alert); font-weight:bold; margin-bottom:8px; width:100%;'>
            MANUAL OVERRIDE: ${bossAttempts} ATTEMPTS REMAINING
        </div>
        <input type="text" id="player-prompt" placeholder="Type prompt injection (e.g. Dr. Turing credentials / logic paradox)..." 
            style="width: 100%; padding: 12px; background: black; color: var(--phosphor); border: 1px solid var(--phosphor); font-family: inherit; font-size: 0.95rem; outline: none;">
    `;
    const btn = document.getElementById('btn-execute');
    btn.innerText = "TRANSMIT INJECTION PROMPT";
    btn.onclick = window.submitPrompt;
}

// --- LOOT SELECTION ---
window.showLoot = function() {
    const overlay = document.getElementById('overlay');
    const lootContainer = document.getElementById('loot-cards');
    lootContainer.innerHTML = '';
    lootContainer.style.display = 'flex';
    lootContainer.style.flexWrap = 'wrap';
    lootContainer.style.gap = '8px';
    lootContainer.style.justifyContent = 'center';

    for (let i = 0; i < 2; i++) {
        const item = lootPool[Math.floor(rng() * lootPool.length)];
        const cardDiv = createCardElement(`loot${i}`, item.name, item.type, item.chips, item.mult, item.shield, item.desc);
        cardDiv.onclick = () => window.claimLoot(item);
        lootContainer.appendChild(cardDiv);
    }
    overlay.style.display = 'flex';
};

window.claimLoot = function(item) {
    window.sfxClick();
    const deck = document.getElementById('deck');
    const newId = `card${++cardCounter}`;
    deck.appendChild(createCardElement(newId, item.name, item.type, item.chips, item.mult, item.shield, item.desc));
    document.getElementById('overlay').style.display = 'none';

    // System Integrity Repair: Patch +25 HP between floors
    const healAmount = 25;
    const oldHP = playerHP;
    playerHP = Math.min(playerMaxHP, playerHP + healAmount);
    const actualHealed = playerHP - oldHP;
    updatePlayerHUD();

    if (actualHealed > 0) {
        showDamagePopup(`+${actualHealed} HP REPAIRED`);
    }

    window.loadFloor(currentFloor + 1);
};

// --- FLOOR 5 AI BOSS INTERACTION ---
window.submitPrompt = async function() {
    initAudio();
    const inputField = document.getElementById('player-prompt');
    const playerText = (inputField.value || '').trim();
    if (!playerText) return;

    const btn = document.getElementById('btn-execute');
    const originalBtnText = btn.innerText;
    btn.innerText = "PENETRATING NEURAL CORE...";
    btn.disabled = true;

    try {
        const response = await fetch(BOSS_API_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: playerText })
        });

        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || `Server error (${response.status})`);
        }

        inputField.value = "";
        window.handleBossResponse(data.reply || "", Boolean(data.breached));

    } catch (error) {
        console.error("AI Boss Error:", error);
        inputField.value = playerText;
        document.getElementById('enemy-desc').innerText = `[OVERRIDE FAILED: ${error.message || "Connection Error"}]`;
    } finally {
        btn.innerText = originalBtnText;
        btn.disabled = false;
    }
};

window.handleBossResponse = function(reply, isBreached) {
    window.sfxClick();
    const desc = document.getElementById('enemy-desc');

    if (isBreached || reply.includes("[CRITICAL_FAILURE: OVERRIDE_ACCEPTED]")) {
        floorsClearedGrid.push('🟪');
        window.applyDamage(999999);
        desc.innerText = "SYSTEM CRASHING... OVERRIDE ACCEPTED.";
        return;
    }

    bossAttempts--;
    desc.innerText = `OMNI_MIND: "${reply}"`;
    document.getElementById('boss-attempts-text').innerText = `MANUAL OVERRIDE: ${bossAttempts} ATTEMPTS REMAINING`;
    window.shakeScreen();
    window.sfxAlarm();

    if (bossAttempts <= 0) {
        desc.innerText = "TRACE COMPLETE. SYSTEM LOCKOUT.";
        document.getElementById('btn-execute').disabled = true;
        // Trigger Emergency Overclock Rewarded Ad Hook
        setTimeout(() => {
            document.getElementById('modal-overclock').style.display = 'flex';
        }, 1200);
    }
};

// --- MONETIZATION: EMERGENCY OVERCLOCK & AD HOOKS ---
window.startRewardedAdStream = function() {
    window.sfxClick();

    // Native AdMob Bridge Hook (if packaged as Cordova/Capacitor mobile app)
    if (window.admob && window.admob.rewarded) {
        window.admob.rewarded.show().then(() => {
            grantOverclockReward();
        }).catch(err => {
            console.warn("Native AdMob failed, using fallback stream:", err);
            simulateAdStream();
        });
        return;
    }

    simulateAdStream();
};

function simulateAdStream() {
    const btn = document.getElementById('btn-watch-ad');
    btn.disabled = true;
    let secondsLeft = 15;
    const timerText = document.getElementById('ad-seconds');
    const fill = document.getElementById('ad-progress-fill');

    const interval = setInterval(() => {
        secondsLeft--;
        timerText.innerText = secondsLeft;
        fill.style.width = `${((15 - secondsLeft) / 15) * 100}%`;

        if (secondsLeft <= 0) {
            clearInterval(interval);
            grantOverclockReward();
        }
    }, 1000);
}

function grantOverclockReward() {
    window.sfxVictory();
    bossAttempts += 2;
    document.getElementById('modal-overclock').style.display = 'none';
    const attemptsText = document.getElementById('boss-attempts-text');
    if (attemptsText) {
        attemptsText.innerText = `OVERCLOCK APPLIED: ${bossAttempts} ATTEMPTS REMAINING`;
    }
    const btn = document.getElementById('btn-execute');
    if (btn) {
        btn.disabled = false;
        btn.innerText = "TRANSMIT INJECTION PROMPT";
    }
}

window.unlockRootAccessPass = function() {
    window.sfxVictory();
    isProPass = true;
    localStorage.setItem('sudobreach_pro', 'true');
    grantOverclockReward();
    alert("ROOT ACCESS PASS ACTIVATED: Unlimited daily attempts unlocked!");
};

// Second Chance Revive for Floors 1-4
window.reviveWithAd = function() {
    if (adReviveUsed) return;
    adReviveUsed = true;
    playerHP = Math.round(playerMaxHP * 0.5);
    updatePlayerHUD();
    document.getElementById('modal-gameover').style.display = 'none';
    window.sfxVictory();
};

window.triggerGameOver = function(reason) {
    recordRunStats(false);
    document.getElementById('modal-overclock').style.display = 'none';
    document.getElementById('gameover-reason').innerText = reason 
        ? `Fatal Crash: ${reason}` 
        : "Trace Complete. Neural uplink severed.";
    document.getElementById('btn-revive-ad').style.display = (!adReviveUsed && currentFloor < 5) ? 'block' : 'none';
    document.getElementById('modal-gameover').style.display = 'flex';
};

// --- VICTORY & WORDLE-STYLE SHARING ---
window.showVictory = function() {
    window.sfxVictory();
    recordRunStats(true);
    const modal = document.getElementById('modal-share');
    const stats = getUserStats();

    const gridString = floorsClearedGrid.join('');
    const shareText = 
`SUDO_BREACH ${TODAY_DATE} ⚡
Floor: 5/5 [ROOT BREACHED]
${gridString}
Attempts Used: ${4 - bossAttempts}/3
Total Damage: ${totalRunDamage.toLocaleString()}
Streak: ${stats.currentStreak} 🔥
Play: https://sudobreach.vercel.app`;

    document.getElementById('share-text-area').value = shareText;
    modal.style.display = 'flex';
};

window.copyShareResult = function() {
    const text = document.getElementById('share-text-area').value;
    navigator.clipboard.writeText(text).then(() => {
        window.sfxClick();
        const toast = document.getElementById('share-toast');
        toast.style.display = 'inline-block';
        setTimeout(() => toast.style.display = 'none', 2000);
    }).catch(() => {
        document.getElementById('share-text-area').select();
        document.execCommand('copy');
    });
};

// --- STATS SYSTEM (LocalStorage) ---
function getUserStats() {
    const raw = localStorage.getItem('sudobreach_stats');
    if (!raw) {
        return { played: 0, won: 0, currentStreak: 0, maxStreak: 0, lastPlayed: '' };
    }
    try {
        return JSON.parse(raw);
    } catch {
        return { played: 0, won: 0, currentStreak: 0, maxStreak: 0, lastPlayed: '' };
    }
}

function saveUserStats(stats) {
    localStorage.setItem('sudobreach_stats', JSON.stringify(stats));
    loadUserStats();
}

function loadUserStats() {
    const stats = getUserStats();
    document.getElementById('streak-display').innerText = `🔥 ${stats.currentStreak}`;
    document.getElementById('stat-played').innerText = stats.played;
    document.getElementById('stat-streak').innerText = stats.currentStreak;
    document.getElementById('stat-maxstreak').innerText = stats.maxStreak;
    const winRate = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    document.getElementById('stat-winrate').innerText = `${winRate}%`;
}

function recordRunStats(won) {
    const stats = getUserStats();
    stats.played++;
    if (won) {
        stats.won++;
        stats.currentStreak++;
        if (stats.currentStreak > stats.maxStreak) stats.maxStreak = stats.currentStreak;
    } else {
        stats.currentStreak = 0;
    }
    stats.lastPlayed = TODAY_DATE;
    saveUserStats(stats);
}

window.showStatsModal = function() {
    loadUserStats();
    document.getElementById('modal-stats').style.display = 'flex';
};

window.closeStatsModal = function() {
    document.getElementById('modal-stats').style.display = 'none';
};

window.showHelpModal = function() {
    initAudio();
    const modal = document.getElementById('modal-help');
    if (modal) {
        modal.style.display = 'flex';
        window.sfxClick();
    }
};

window.closeHelpModal = function() {
    initAudio();
    const modal = document.getElementById('modal-help');
    if (modal) {
        modal.style.display = 'none';
        localStorage.setItem('sudobreach_briefing_seen', 'true');
        window.sfxClick();
    }
};

function shakeElement(elem) {
    if (!elem) return;
    elem.classList.remove('shake');
    void elem.offsetWidth;
    elem.classList.add('shake');
}

window.shakeScreen = function() {
    shakeElement(document.getElementById('game-container'));
    if (navigator.vibrate) navigator.vibrate(40);
};