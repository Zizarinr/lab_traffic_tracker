'use strict';

/* Lab Scan KTM — logika layar kiosk dan input scanner. */

const STATE = {
  STANDBY: 'state-standby',
  SUCCESS: 'state-success',
  NOTFOUND: 'state-notfound',
  DUPLICATE: 'state-duplicate',
  ERROR: 'state-error',
};

const clockEl = document.getElementById('clock');
const screenEl = document.getElementById('screen');
const scannerEl = document.getElementById('scanner');
const labNameEl = document.getElementById('lab-name');
const counterEl = document.getElementById('today-counter');
const syncReminderEl = document.getElementById('sync-reminder');
const manualInputEl = document.getElementById('manual-input');
const sNama = document.getElementById('s-nama');
const sKelas = document.getElementById('s-kelas');
const sNim = document.getElementById('s-nim');

const MAX_BUFFER = 64;
const HEALTH_POLL_MS = 5000;
const STATS_REFRESH_MS = 60000;
// Deteksi scanner keyboard-wedge dari kecepatan ketikan (Fase 3):
// manusia ~100-300 ms per karakter, scanner ~2-10 ms per karakter.
const SCANNER_GAP_MS = 30;
const SCANNER_MIN_GAPS = 2;

let welcomeSeconds = 3;
let syncEnabled = true;
let pendingSync = 0;
let scannerBurst = false; // true selama ketikan datang dari scanner (echo disembunyikan)
let lastKeyAt = 0;
let fastGaps = 0;
let stateTimer = null;
let healthTimer = null;
let buffer = '';

/* ---------------- State layar ---------------- */

function setState(state, durationMs) {
  screenEl.className = state;
  if (stateTimer) {
    clearTimeout(stateTimer);
    stateTimer = null;
  }
  if (durationMs > 0) {
    stateTimer = setTimeout(() => {
      stateTimer = null;
      setState(STATE.STANDBY, 0);
    }, durationMs);
  }
}

function showSuccess(data) {
  sNama.textContent = data.nama || '-';
  sKelas.textContent = `Kelas ${data.kelas || '-'} | Semester ${data.semester || '-'}`;
  sNim.textContent = `NIM ${data.nim || '-'}`;
  setState(STATE.SUCCESS, welcomeSeconds * 1000);
}

function showError() {
  setState(STATE.ERROR, 0);
  startHealthPoll();
}

/** Pengingat status sinkronisasi: tampil di layar standby bila nonaktif. */
function renderSyncReminder() {
  document.body.classList.toggle('sync-off', !syncEnabled);
  if (syncEnabled) {
    syncReminderEl.textContent = '';
  } else {
    syncReminderEl.textContent =
      `PENGINGAT: SINKRONISASI NONAKTIF — ${pendingSync} log menunggu`;
  }
}

/* ---------------- Komunikasi server ---------------- */

async function loadConfig() {
  try {
    const res = await fetch('/api/config', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    if (data.lab_name) labNameEl.textContent = data.lab_name;
    if (Number.isFinite(data.welcome_seconds) && data.welcome_seconds > 0) {
      welcomeSeconds = data.welcome_seconds;
    }
    syncEnabled = data.sync_enabled !== false;
    renderSyncReminder();
  } catch (err) {
    /* pakai nilai default; server belum siap */
  }
}

async function refreshStats() {
  try {
    const res = await fetch('/api/stats', { cache: 'no-store' });
    if (!res.ok) return;
    const data = await res.json();
    counterEl.textContent = `Hari ini: ${data.today || 0} kunjungan`;
    pendingSync = Number.isFinite(data.pending_sync) ? data.pending_sync : 0;
    renderSyncReminder();
  } catch (err) {
    /* diamkan; counter diperbarui lagi di siklus berikutnya */
  }
}

function startHealthPoll() {
  if (healthTimer) return;
  healthTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (!res.ok) return;
      clearInterval(healthTimer);
      healthTimer = null;
      setState(STATE.STANDBY, 0);
      refreshStats();
    } catch (err) {
      /* server masih mati, coba lagi nanti */
    }
  }, HEALTH_POLL_MS);
}

function cleanNim(raw) {
  // Bersihkan spasi / karakter non-alfanumerik di awal dan akhir.
  return String(raw).replace(/^[^0-9a-zA-Z]+/, '').replace(/[^0-9a-zA-Z]+$/, '');
}

async function submitScan(rawNim) {
  const nim = cleanNim(rawNim);
  if (nim === '') return;

  let res;
  try {
    res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nim }),
    });
  } catch (err) {
    showError();
    return;
  }

  if (res.status >= 500) {
    showError();
    return;
  }
  if (res.status === 400) {
    // NIM tidak sah (mis. hasil noise scanner): abaikan tanpa mengganggu layar.
    return;
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    showError();
    return;
  }

  if (data.duplicate) {
    setState(STATE.DUPLICATE, 1500);
    return;
  }

  if (data.status === 'ok') {
    showSuccess(data);
  } else {
    setState(STATE.NOTFOUND, welcomeSeconds * 1000);
  }
  refreshStats();
}

/* ---------------- Input scanner ---------------- */

function focusScanner() {
  if (document.activeElement !== scannerEl) {
    scannerEl.focus({ preventScroll: true });
  }
}

/** Tampilkan NIM yang sedang diketik. Disembunyikan selama burst scanner. */
function renderBuffer() {
  manualInputEl.textContent = scannerBurst ? '' : buffer;
}

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.altKey || event.metaKey) return;

  if (event.key === 'Enter') {
    event.preventDefault();
    lastKeyAt = 0; // Enter menutup satu "burst"; deteksi dimulai lagi dari nol.
    fastGaps = 0;
    scannerBurst = false;
    document.body.classList.remove('scanner-burst');
    const raw = buffer;
    buffer = '';
    renderBuffer();
    submitScan(raw); // Enter tanpa input -> cleanNim('') -> diabaikan
    return;
  }

  // Koreksi saat mengetik manual (scanner tidak mengirim tombol ini).
  if (event.key === 'Backspace' || event.key === 'Delete') {
    if (buffer.length > 0) {
      buffer = buffer.slice(0, -1);
      renderBuffer();
    }
    return;
  }
  if (event.key === 'Escape') {
    buffer = '';
    renderBuffer();
    return;
  }

  if (event.key.length === 1) {
    noteKeyTiming();
    if (buffer.length < MAX_BUFFER) {
      buffer += event.key;
      renderBuffer();
    }
  }
});

/**
 * Deteksi scanner keyboard-wedge dari kecepatan ketikan.
 * Bila >=SCANNER_MIN_GAPS karakter berturut-turut berjarak <=SCANNER_GAP_MS
 * (mustahil bagi manusia), ketikan dianggap burst scanner dan echo/petunjuk
 * disembunyikan hingga Enter. Bila ketikan melambat (manusia mengambil alih),
 * echo tampil kembali — jadi input manual selalu tersedia tanpa perlu setelan.
 */
function noteKeyTiming() {
  const now = Date.now();
  const gap = lastKeyAt > 0 ? now - lastKeyAt : Number.POSITIVE_INFINITY;
  fastGaps = gap <= SCANNER_GAP_MS ? fastGaps + 1 : 0;
  lastKeyAt = now;

  if (!scannerBurst && fastGaps >= SCANNER_MIN_GAPS) {
    scannerBurst = true;
  } else if (scannerBurst && gap > SCANNER_GAP_MS) {
    // Ketikan melambat setelah burst: manusia melanjutkan input.
    scannerBurst = false;
  }

  document.body.classList.toggle('scanner-burst', scannerBurst);
}

scannerEl.addEventListener('blur', () => {
  setTimeout(focusScanner, 0);
});
window.addEventListener('focus', focusScanner);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) focusScanner();
});

/* ---------------- Jam dan siklus berkala ---------------- */

function tick() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  clockEl.textContent = `${hh}:${mm}`;
  focusScanner();
}

setInterval(tick, 1000);
setInterval(refreshStats, STATS_REFRESH_MS);

/* ---------------- Mulai ---------------- */
focusScanner();
tick();
loadConfig();
refreshStats();
