'use strict';

// Worker sinkronisasi: kirim log scan (`synced = 0`) ke sistem monitoring.
// Aturan mengikuti api.md: batch, timeout, backoff, dan penandaan `synced`.
// Sinkronisasi berjalan asinkron dan tidak pernah memblokir proses scan.

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');
const { nowIso } = require('./db');

const BACKOFF_BASE_SECONDS = 30;

/** Logger sederhana: tulis ke file dan (opsional) ke console. */
function createLogger(filePath, { echo = true } = {}) {
  let stream = null;
  if (filePath) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    stream = fs.createWriteStream(filePath, { flags: 'a' });
  }
  return {
    write(line) {
      const stamped = `${nowIso()} | ${line}`;
      if (stream) stream.write(`${stamped}\n`);
      if (echo) console.log(`[sync] ${line}`);
    },
    close() {
      if (stream) {
        stream.end();
        stream = null;
      }
    },
  };
}

/** Ambil log yang belum tersinkron, urut waktu scan (lama dulu). */
function getPendingBatch(db, limit) {
  return db
    .prepare(
      `SELECT id, nim, nama, kelas, semester, scanned_at, status
         FROM scan_log
        WHERE synced = 0
        ORDER BY scanned_at ASC, id ASC
        LIMIT ?`
    )
    .all(limit);
}

/** Tandai sejumlah id sebagai terkirim. Kembalikan jumlah baris yang berubah. */
function markSynced(db, ids, syncedAt) {
  if (!ids || ids.length === 0) return 0;
  const stmt = db.prepare('UPDATE scan_log SET synced = 1, synced_at = ? WHERE id = ? AND synced = 0');
  const run = db.transaction((list) => {
    let total = 0;
    for (const id of list) total += stmt.run(syncedAt, id).changes;
    return total;
  });
  return run(ids);
}

/** Susun payload sesuai kontrak di api.md. */
function buildPayload(labName, records, sentAt) {
  return {
    lab: labName,
    sent_at: sentAt,
    records: records.map((r) => ({
      id: r.id,
      nim: r.nim,
      nama: r.nama,
      kelas: r.kelas,
      semester: r.semester,
      scanned_at: r.scanned_at,
      status: r.status,
    })),
  };
}

/**
 * Tentukan id yang boleh ditandai terkirim.
 * Bila monitoring membalas { accepted: [...] }, hanya id itu yang ditandai.
 * Bila tidak ada, seluruh batch dianggap diterima saat 2xx.
 */
function extractAcceptedIds(body, batch) {
  if (body && Array.isArray(body.accepted)) {
    const accepted = new Set(body.accepted.map(String));
    return batch.filter((r) => accepted.has(r.id)).map((r) => r.id);
  }
  return batch.map((r) => r.id);
}

/** Backoff: 30, 60, 120, 240, ... dibatasi maksimum (default interval normal). */
function computeBackoffSeconds(attempt, { baseSeconds = BACKOFF_BASE_SECONDS, maxSeconds = 300 } = {}) {
  if (attempt <= 0) return 0;
  return Math.min(baseSeconds * 2 ** (attempt - 1), maxSeconds);
}

/** Kirim satu batch dengan timeout. Melempar error jaringan/timeout. */
async function sendBatch({ url, token, payload, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    let body = null;
    try {
      body = await res.json();
    } catch (err) {
      body = null; // respons tanpa body JSON tetap dianggap sah bila status 2xx
    }
    return { status: res.status, body };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Buat worker sinkronisasi.
 * @param {{ db: object, cfg?: object, logger?: object, fetchImpl?: Function, scheduler?: object }} options
 */
function createSyncWorker({ db, cfg = config, logger, fetchImpl = fetch, scheduler } = {}) {
  const setT = (scheduler && scheduler.setTimeout) || setTimeout;
  const clearT = (scheduler && scheduler.clearTimeout) || clearTimeout;
  const log = logger || createLogger();

  let timer = null;
  let stopped = false;
  let failStreak = 0;

  function scheduleNext(seconds) {
    if (stopped) return;
    const ms = Math.max(0, Math.round(seconds * 1000));
    timer = setT(runCycle, ms);
  }

  async function runCycle() {
    timer = null;
    if (stopped) return;

    if (!cfg.monitorUrl) {
      log.write('LEWAT | MONITOR_URL belum diisi di .env');
      scheduleNext(cfg.syncIntervalSeconds);
      return;
    }

    let batch = getPendingBatch(db, cfg.syncBatchSize);
    if (batch.length === 0) {
      failStreak = 0;
      scheduleNext(cfg.syncIntervalSeconds);
      return;
    }

    while (batch.length > 0) {
      if (stopped) return;
      const payload = buildPayload(cfg.labName, batch, nowIso());

      let result;
      try {
        result = await sendBatch({
          url: cfg.monitorUrl,
          token: cfg.monitorToken,
          payload,
          timeoutMs: cfg.syncTimeoutSeconds * 1000,
          fetchImpl,
        });
      } catch (err) {
        // Jaringan putus / timeout: data dibiarkan apa adanya, retry dengan backoff.
        failStreak += 1;
        const delay = computeBackoffSeconds(failStreak, { maxSeconds: cfg.syncIntervalSeconds });
        const reason = err && err.name === 'AbortError' ? 'timeout' : (err && err.message) || 'gagal jaringan';
        log.write(`GAGAL | kirim=${batch.length} | ${reason} | retry dalam ${delay}s`);
        scheduleNext(delay);
        return;
      }

      if (result.status >= 400 && result.status < 500) {
        // Token/format salah: catat jelas, jangan retry agresif.
        failStreak = 0;
        log.write(
          `DITOLAK | status=${result.status} kirim=${batch.length} | periksa MONITOR_TOKEN/format | coba lagi ${cfg.syncIntervalSeconds}s`
        );
        scheduleNext(cfg.syncIntervalSeconds);
        return;
      }

      if (result.status >= 500) {
        failStreak += 1;
        const delay = computeBackoffSeconds(failStreak, { maxSeconds: cfg.syncIntervalSeconds });
        log.write(`GAGAL | status=${result.status} kirim=${batch.length} | retry dalam ${delay}s`);
        scheduleNext(delay);
        return;
      }

      // 2xx: tandai yang diterima.
      const acceptedIds = extractAcceptedIds(result.body, batch);
      const marked = markSynced(db, acceptedIds, nowIso());
      failStreak = 0;
      log.write(
        `SUKSES | status=${result.status} kirim=${batch.length} tersimpan=${marked}` +
          (acceptedIds.length < batch.length ? ` | sebagian (accepted=${acceptedIds.length})` : '')
      );

      const remaining = getPendingBatch(db, cfg.syncBatchSize);
      if (remaining.length === 0) break;

      if (marked === 0) {
        // 2xx tapi tidak ada id yang diterima: hindari loop tanpa akhir.
        log.write('PERINGATAN | 2xx tanpa id diterima, siklus dihentikan sampai interval berikutnya');
        break;
      }
      batch = remaining; // langsung kirim batch berikutnya
    }

    scheduleNext(cfg.syncIntervalSeconds);
  }

  function start({ immediateSeconds = 1 } = {}) {
    stopped = false;
    failStreak = 0;
    log.write(
      `MULAI | interval=${cfg.syncIntervalSeconds}s batch=${cfg.syncBatchSize} timeout=${cfg.syncTimeoutSeconds}s url=${cfg.monitorUrl}`
    );
    scheduleNext(immediateSeconds);
  }

  function stop() {
    stopped = true;
    if (timer) {
      clearT(timer);
      timer = null;
    }
  }

  return {
    start,
    stop,
    runCycle,
    get failStreak() {
      return failStreak;
    },
  };
}

module.exports = {
  createSyncWorker,
  createLogger,
  getPendingBatch,
  markSynced,
  buildPayload,
  extractAcceptedIds,
  computeBackoffSeconds,
  sendBatch,
};
