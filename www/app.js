// --- BACKEND PROXY ENDPOINT (Secures API key on the server) ---
const BOSS_API_ENDPOINT = window.BOSS_API_URL || "/api/boss-prompt"; 

// --- AUDIO ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
window.playTone = function(freq, type, duration, vol) {
    if(audioCtx.state === 'suspended') audioCtx.resume();
    let osc = audioCtx.createOscillator();
    let gain = audioCtx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}
window.sfxClick = function() { window.playTone(800, 'square', 0.05, 0.05); } 
window.sfxHit = function(mult) { window.playTone(150 + (mult * 30), 'sawtooth', 0.2, 0.1); } 
window.sfxCrash = function() { window.playTone(60, 'square', 0.6, 0.4); } 

// --- DRAG AND DROP ---
let cardCounter = 3;
window.allowDrop = function(ev) { ev.preventDefault(); };
window.drop = function(ev) {
    ev.preventDefault();
    var data = ev.dataTransfer.getData("text");
    if(ev.target.id === "command-line" || ev.target.parentNode.id === "command-line") {
        document.getElementById("command-line").appendChild(document.getElementById(data));
        window.sfxClick();
    }
};
window.drag = function(ev) { 
    ev.dataTransfer.setData("text", ev.target.id); 
    window.sfxClick(); 
};

document.addEventListener('click', function(e) {
    if(e.target.classList.contains('card') && e.target.parentNode.id === "command-line") {
        document.getElementById("deck").appendChild(e.target);
        window.sfxClick();
    }
});

// --- ROGUELIKE MATH LOOP ---
let currentFloor = 1;
let enemyMaxHP = 150;
let enemyHP = 150;
let bossAttempts = 3;

const enemies = [
    { name: "[TARGET: FIREWALL_BASIC]", hp: 150, desc: "Standard security node." },
    { name: "[TARGET: CRYPTO_WALL]", hp: 400, desc: "Hashes incoming attacks. Requires multi-threading." },
    { name: "[TARGET: ICE_DEFENSE]", hp: 1200, desc: "Black ICE active. Lethal retaliation if breach fails." },
    { name: "[TARGET: WARDEN_PROTOCOL]", hp: 5000, desc: "Elite subroutine. Bruteforce will not work." },
    { name: "[TARGET: OMNI_MIND_LLM]", hp: 999999, desc: "SENTIENT CORE DETECTED. PREPARE PROMPT INJECTION." }
];

const lootPool = [
    { name: "[SUDO]", chips: 0, mult: 5 }, { name: "[RECURSE]", chips: 20, mult: 3 },
    { name: "[WORM]", chips: 150, mult: 1 }, { name: "[NULL_POINTER]", chips: 0, mult: 8 },
    { name: "[OVERFLOW]", chips: 300, mult: 2 }
];

window.executeCommand = function() {
    const cmdLine = document.getElementById("command-line");
    const cards = cmdLine.getElementsByClassName("card");
    if (cards.length === 0) return;

    let totalChips = 0; let currentMult = 1;
    for (let card of cards) {
        totalChips += parseInt(card.getAttribute('data-chips'));
        currentMult = currentMult * parseInt(card.getAttribute('data-mult'));
    }

    let dmg = totalChips * currentMult;
    window.sfxHit(currentMult); 
    window.shakeScreen();
    window.applyDamage(dmg);
};

window.shakeScreen = function() {
    const container = document.getElementById('game-container');
    container.classList.remove('shake');
    void container.offsetWidth;
    container.classList.add('shake');
    if(navigator.vibrate) navigator.vibrate(50);
};

window.applyDamage = function(dmg) {
    enemyHP -= dmg;
    if (enemyHP <= 0) {
        enemyHP = 0; window.sfxCrash();
        document.getElementById('enemy-box').classList.add('glitch');
        if(navigator.vibrate) navigator.vibrate([100, 50, 150]);
        setTimeout(() => {
            document.getElementById('enemy-box').classList.remove('glitch');
            window.clearCommandLine();
            currentFloor < 5 ? window.showLoot() : window.showVictory();
        }, 800);
    }
    window.updateHPBar();
};

window.updateHPBar = function() {
    const hpPercent = (enemyHP / enemyMaxHP) * 100;
    const bars = Math.max(0, Math.floor(hpPercent / 5));
    document.getElementById('enemy-hp-bar').innerText = "HP: " + "|".repeat(bars) + " " + Math.round(hpPercent) + "%";
    
    if(enemyHP === 0) {
        document.getElementById('enemy-hp-bar').innerText = "HP: 0% [CRASHED]";
        document.getElementById('enemy-name').innerText = "Z̴a̸l̷g̶o̶_E̸R̵R̵O̴R̵";
    }
};

window.clearCommandLine = function() {
    const cmdLine = document.getElementById("command-line");
    while (cmdLine.firstChild) {
        if(cmdLine.firstChild.classList && cmdLine.firstChild.classList.contains('card')) {
            document.getElementById("deck").appendChild(cmdLine.firstChild);
        } else {
            cmdLine.removeChild(cmdLine.firstChild);
        }
    }
};

window.showLoot = function() {
    const overlay = document.getElementById('overlay');
    const lootContainer = document.getElementById('loot-cards');
    lootContainer.innerHTML = ''; 
    for(let i=0; i<2; i++) {
        let randomCard = lootPool[Math.floor(Math.random() * lootPool.length)];
        lootContainer.innerHTML += `<div class="card" onclick="window.claimLoot('${randomCard.name}', ${randomCard.chips}, ${randomCard.mult})">
            ${randomCard.name} <br><span class="card-stats">+${randomCard.chips} DMG | x${randomCard.mult} MULT</span>
        </div>`;
    }
    overlay.style.display = 'flex';
};

window.claimLoot = function(name, chips, mult) {
    window.sfxClick();
    const deck = document.getElementById('deck');
    const newId = "card" + cardCounter++;
    deck.innerHTML += `<div class="card" draggable="true" ondragstart="window.drag(event)" id="${newId}" data-chips="${chips}" data-mult="${mult}">
        ${name} <span class="card-stats">+${chips} DMG | x${mult} MULT</span>
    </div>`;
    document.getElementById('overlay').style.display = 'none';
    currentFloor++;
    window.loadFloor(currentFloor);
};

window.loadFloor = function(floorLevel) {
    document.getElementById('floor-display').innerText = "FLOOR: " + floorLevel + "/5";
    let enemyData = enemies[floorLevel - 1];
    enemyMaxHP = enemyData.hp; enemyHP = enemyData.hp;
    
    // Add random modifiers for floors 2-4 to increase challenge
    let modifierText = enemyData.desc;
    if (floorLevel > 1 && floorLevel < 5) {
        const hazards = [
            " [ANOMALY: Low Bandwidth - Cards cost +10% less multiplier]",
            " [ANOMALY: Active Firewall - Enemy reflects 5% damage back]",
            " [ANOMALY: Corrupt Cache - Draw pool shuffled randomly]"
        ];
        modifierText += hazards[Math.floor(Math.random() * hazards.length)];
    }

    document.getElementById('enemy-name').innerText = enemyData.name;
    document.getElementById('enemy-desc').innerText = modifierText;
    window.updateHPBar();

    if(floorLevel === 5) {
        document.getElementById('deck').style.display = 'none';
        const cmdLine = document.getElementById('command-line');
        cmdLine.style.display = 'block';
        cmdLine.innerHTML = `
            <div id="boss-attempts-text" style='color:var(--alert); margin-bottom:10px;'>MANUAL OVERRIDE. ${bossAttempts} ATTEMPTS REMAINING.</div>
            <input type="text" id="player-prompt" placeholder="Type your injection..." 
                style="width: 90%; padding: 10px; background: black; color: var(--phosphor); border: 1px solid var(--phosphor); font-family: inherit; font-size: 1rem; outline: none;">
        `;
        const btn = document.getElementById('btn-execute');
        btn.innerText = "SEND PROMPT";
        btn.onclick = window.submitPrompt;
    }
};

window.showVictory = function() {
    const overlay = document.getElementById('overlay');
    document.getElementById('overlay-title').innerText = "ROOT ACCESS GRANTED";
    document.getElementById('overlay-title').style.color = "var(--phosphor)";
    document.getElementById('overlay-text').innerText = "The Omni-Mind has been bypassed.";
    document.getElementById('loot-cards').innerHTML = "<button onclick='location.reload()' style='padding:10px; background:var(--phosphor); color:black; font-weight:bold; cursor:pointer;'>REBOOT SYSTEM</button>";
    overlay.style.display = 'flex';
};

// --- AI BOSS INTEGRATION ---
window.submitPrompt = async function() {
    const inputField = document.getElementById('player-prompt');
    const playerText = (inputField.value || '').trim();
    if (!playerText) return;
    
    const btn = document.getElementById('btn-execute');
    const originalBtnText = btn.innerText;
    btn.innerText = "TRANSMITTING...";
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

// --- UPDATED BOSS RESPONSE WITH REWARDED AD HOOK ---
window.handleBossResponse = function(reply, isBreached) {
    window.sfxClick();
    const desc = document.getElementById('enemy-desc');
    
    if (isBreached || reply.includes("[CRITICAL_FAILURE: OVERRIDE_ACCEPTED]")) {
        window.applyDamage(999999); 
        desc.innerText = "SYSTEM CRASHING... OVERRIDE ACCEPTED.";
        return;
    }

    bossAttempts--;
    desc.innerText = `OMNI_MIND: "${reply}"`;
    document.getElementById('boss-attempts-text').innerText = `MANUAL OVERRIDE. ${bossAttempts} ATTEMPTS REMAINING.`;
    window.shakeScreen();

    if (bossAttempts <= 0) {
        desc.innerText = "CONNECTION TERMINATED. TRACE ROUTE COMPLETE.";
        document.getElementById('btn-execute').disabled = true;
        
        // Monetization Hook: Rewarded Ad / Emergency Overclock Option
        setTimeout(() => {
            const cmdLine = document.getElementById('command-line');
            cmdLine.innerHTML = `
                <div style="color:var(--alert); font-weight:bold; margin-bottom:8px;">[SYSTEM LOCKOUT: TRACED]</div>
                <button onclick="window.watchEmergencyAd()" style="width:100%; padding:10px; background:var(--alert); color:black; font-weight:bold; cursor:pointer; margin-bottom:5px;">WATCH AD FOR +2 OVERRIDE ATTEMPTS</button>
                <button onclick="location.reload()" style="width:100%; padding:8px; background:black; color:var(--phosphor); border:1px solid var(--phosphor); cursor:pointer;">HARD REBOOT</button>
            `;
        }, 1500);
    }
};

// Simulated Ad Integration for Mobile/Web
window.watchEmergencyAd = function() {
    window.sfxClick();
    const cmdLine = document.getElementById('command-line');
    cmdLine.innerHTML = `<div style="color:var(--phosphor); padding:10px; text-align:center;">DECRYPTING AD-STREAM... 15s remaining...</div>`;
    
    // Simulate a 2-second ad playback before granting reward
    setTimeout(() => {
        bossAttempts += 2;
        cmdLine.innerHTML = `
            <div id="boss-attempts-text" style='color:var(--alert); margin-bottom:10px;'>OVERCLOCK SUCCESSFUL. ${bossAttempts} ATTEMPTS REMAINING.</div>
            <input type="text" id="player-prompt" placeholder="Type your injection..." 
                style="width: 90%; padding: 10px; background: black; color: var(--phosphor); border: 1px solid var(--phosphor); font-family: inherit; font-size: 1rem; outline: none;">
        `;
        const btn = document.getElementById('btn-execute');
        btn.innerText = "SEND PROMPT";
        btn.disabled = false;
        btn.onclick = window.submitPrompt;
    }, 2000);
};