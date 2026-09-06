// ==================== TELEGRAM ====================
const tg = window.Telegram.WebApp;
tg.expand();
const user = tg.initDataUnsafe?.user || { id: 'guest', username: 'Guest' };

// ==================== STATE ====================
let currentPage = 'dashboard';
let onlineCount = 0;

// ==================== DOM REFS ====================
const pages = {
    dashboard: document.getElementById('page-dashboard'),
    checker: document.getElementById('page-checker'),
    profile: document.getElementById('page-profile'),
    settings: document.getElementById('page-settings')
};
const navBtns = document.querySelectorAll('.nav-btn');

// ==================== SAYFA GEÇİŞİ ====================
function switchPage(page) {
    Object.keys(pages).forEach(key => {
        pages[key].classList.remove('active');
    });
    if (pages[page]) pages[page].classList.add('active');
    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    currentPage = page;
}

navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchPage(btn.dataset.page));
});

// ==================== JOIN REQUIRED ====================
let joined = false;

function joinChannel() {
    tg.openLink('https://t.me/your_channel');
}

function joinHits() {
    tg.openLink('https://t.me/your_hits_channel');
}

async function joinContinue() {
    const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id })
    });
    const data = await res.json();
    if (data.success) {
        joined = true;
        document.getElementById('join-required').classList.remove('active');
        document.getElementById('main-app').classList.add('active');
        loadDashboard();
        loadProfile();
        startOnlinePing();
    } else {
        tg.showAlert('❌ Please join both channels first.');
    }
}

// ==================== DASHBOARD ====================
async function loadDashboard() {
    try {
        // Kullanıcı bilgisi
        const userRes = await fetch(`/api/user?user_id=${user.id}`);
        const userData = await userRes.json();
        document.getElementById('dash-username').textContent = userData.username || 'Guest';
        document.getElementById('dash-username-tag').textContent = `@${userData.username || 'unknown'}`;
        document.getElementById('dash-credits').textContent = userData.credits || 0;

        // İstatistikler
        const statsRes = await fetch('/api/stats');
        const stats = await statsRes.json();
        document.getElementById('stat-checked').textContent = stats.checked || 0;
        document.getElementById('stat-hits').textContent = stats.hits || 0;
        document.getElementById('stat-charged').textContent = stats.charged || 0;
        document.getElementById('stat-hitrate').textContent = stats.hitRate || '0%';

        // Leaderboard
        const lbRes = await fetch('/api/leaderboard');
        const lb = await lbRes.json();
        const lbList = document.getElementById('leaderboard-list');
        lbList.innerHTML = '';
        lb.top?.forEach(item => {
            const div = document.createElement('div');
            div.className = 'lb-item';
            div.innerHTML = `<span>${item.username}</span><span>${item.hits} hits</span>`;
            lbList.appendChild(div);
        });
        const total = document.createElement('div');
        total.className = 'lb-item';
        total.innerHTML = `<span>${lb.totalPlayers || 0} players</span>`;
        lbList.appendChild(total);

        // Online sayısı (gerçek online sayısı Redis'ten gelecek)
        const onlineRes = await fetch('/api/online');
        const onlineData = await onlineRes.json();
        document.getElementById('online-count').textContent = onlineData.online || 0;

    } catch (e) {
        console.error('Dashboard load error:', e);
    }
}

// ==================== CHECKER ====================
let isChecking = false;

async function startCheck() {
    if (isChecking) return;
    const raw = document.getElementById('card-input').value.trim();
    if (!raw) {
        tg.showAlert('⚠️ Paste at least one card.');
        return;
    }

    const cards = raw.split('\n').filter(line => line.trim() !== '');
    const gate = document.getElementById('gate-select').value;
    const threads = parseInt(document.querySelector('.thread-btn.active')?.dataset.threads || '1');

    isChecking = true;
    document.querySelector('.start-btn').disabled = true;
    document.querySelector('.start-btn').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

    const resultsContainer = document.getElementById('checker-results');
    resultsContainer.innerHTML = '';

    // Kartları thread sayısına göre böl
    const chunks = [];
    for (let i = 0; i < cards.length; i += threads) {
        chunks.push(cards.slice(i, i + threads));
    }

    let checkedCount = 0;
    let hitCount = 0;
    let chargedCount = 0;

    for (const chunk of chunks) {
        const promises = chunk.map(async (cc) => {
            try {
                const res = await fetch('/api/check', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        cc: cc.trim(),
                        user_id: user.id,
                        gate: gate
                    })
                });
                const data = await res.json();

                // Sonucu göster
                const div = document.createElement('div');
                div.className = `result-item ${data.status}`;
                div.innerHTML = `<span>${cc.trim()}</span><span>${data.result}</span>`;
                resultsContainer.appendChild(div);

                checkedCount++;
                if (data.status === 'approved') {
                    hitCount++;
                    // Charged sadece belirli gate'lerde
                    if (gate.includes('live')) chargedCount++;
                }

                return data;
            } catch (err) {
                const div = document.createElement('div');
                div.className = 'result-item declined';
                div.innerHTML = `<span>${cc.trim()}</span><span>❌ Error</span>`;
                resultsContainer.appendChild(div);
                return { status: 'declined' };
            }
        });

        await Promise.all(promises);

        // Her chunk sonrası istatistikleri güncelle (canlı)
        document.getElementById('stat-checked').textContent = checkedCount;
        document.getElementById('stat-hits').textContent = hitCount;
        document.getElementById('stat-charged').textContent = chargedCount;
        const rate = checkedCount > 0 ? Math.round((hitCount / checkedCount) * 100) : 0;
        document.getElementById('stat-hitrate').textContent = rate + '%';
    }

    // Tüm kartlar bitti
    isChecking = false;
    document.querySelector('.start-btn').disabled = false;
    document.querySelector('.start-btn').innerHTML = '<i class="fas fa-play"></i> Start';

    // Genel istatistikleri güncelle
    await fetch('/api/stats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            checked: checkedCount,
            hits: hitCount,
            charged: chargedCount,
            user_id: user.id
        })
    });

    // Leaderboard'u güncelle
    await fetch('/api/leaderboard/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, hits: hitCount })
    });

    // Kullanıcı kredisini güncelle (her hit için +1 kredi gibi)
    await fetch('/api/user/add-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, amount: hitCount })
    });

    // Dashboard'u yenile
    loadDashboard();
}

// ==================== PROFİL ====================
async function loadProfile() {
    try {
        const res = await fetch(`/api/user?user_id=${user.id}`);
        const data = await res.json();
        document.getElementById('profile-name').textContent = data.username || 'Guest';
        document.getElementById('profile-username').textContent = `@${data.username || 'unknown'}`;
        document.getElementById('profile-credits-value').textContent = data.credits || 0;
    } catch (e) {}
}

// ==================== CLAIM DAILY ====================
async function claimDaily() {
    const res = await fetch('/api/user/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id })
    });
    const data = await res.json();
    if (data.success) {
        tg.showAlert(`✅ Claimed ${data.amount} credits!`);
        loadDashboard();
        loadProfile();
    } else {
        tg.showAlert(`⏳ Already claimed today. Next claim in ${data.remaining} hours.`);
    }
}

// ==================== REDEEM CODE ====================
async function redeemCode() {
    const code = document.getElementById('redeem-input').value.trim();
    if (!code) {
        tg.showAlert('⚠️ Enter a redeem code.');
        return;
    }
    const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, user_id: user.id })
    });
    const data = await res.json();
    tg.showAlert(data.message);
    if (data.success) {
        loadDashboard();
        loadProfile();
    }
}

// ==================== ONLINE SAYACI (PING) ====================
function startOnlinePing() {
    setInterval(async () => {
        try {
            const res = await fetch('/api/online/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: user.id })
            });
            const data = await res.json();
            document.getElementById('online-count').textContent = data.online || 0;
        } catch (e) {}
    }, 30000); // her 30 saniye
}

// ==================== F12 ENGELLEME ====================
document.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && ['I', 'J', 'C'].includes(e.key.toUpperCase())) || (e.ctrlKey && e.key === 'u')) {
        e.preventDefault();
        tg.showAlert('🔒 Developer tools disabled.');
    }
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ==================== BAŞLANGIÇ ====================
// Join kontrolü
(async () => {
    const res = await fetch(`/api/join/status?user_id=${user.id}`);
    const data = await res.json();
    if (data.joined) {
        joined = true;
        document.getElementById('join-required').classList.remove('active');
        document.getElementById('main-app').classList.add('active');
        loadDashboard();
        loadProfile();
        startOnlinePing();
    } else {
        document.getElementById('join-required').classList.add('active');
    }
})();

// Thread butonları
document.querySelectorAll('.thread-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.thread-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});
