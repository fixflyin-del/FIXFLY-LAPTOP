(function (global) {
  'use strict';

  const CLOUD_SYNC_BASE = 'https://kvdb.io/DEtS3yMR6BUsjGzjGvjSuP';
  const LS_CUSTOM_KEY = 'fixfly_custom_blogs';
  const LS_DELETED_KEY = 'fixfly_deleted_blog_slugs';
  const LS_PENDING_KEY = 'fixfly_blog_pending_sync';
  const IDB_NAME = 'FixflyLifetimeBlogDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'blog_store';

  // In-memory session floor prevents stale CDN/edge GET cache from hiding newly saved posts
  let sessionCustomCache = new Map();
  let sessionDeletedCache = new Map();
  let reqSeq = 0;

  function getMigratedArticles() {
    return (typeof global.WP_MIGRATED_ARTICLES !== 'undefined' && Array.isArray(global.WP_MIGRATED_ARTICLES))
      ? global.WP_MIGRATED_ARTICLES
      : [];
  }

  function safeParseJson(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed !== null && parsed !== undefined ? parsed : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function normalizeSlug(raw) {
    return String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, '')
      .replace(/^blog\//i, '')
      .replace(/[^a-z0-9\u0900-\u097f\-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || ('article-' + Date.now());
  }

  function cloudArticleKey(slug) {
    const ascii = String(slug || '').replace(/[^a-zA-Z0-9_-]/g, function (ch) {
      return '_u' + ch.charCodeAt(0).toString(16) + '_';
    });
    return 'blog_v2_' + ascii.slice(0, 120);
  }

  function sanitizeArticle(art) {
    if (!art || typeof art !== 'object') return null;
    const slug = String(art.slug || '').trim();
    if (!slug) return null;
    return {
      slug: slug,
      title: String(art.title || 'Untitled Article').trim(),
      category: String(art.category || 'Laptop Repair').trim(),
      date: String(art.date || new Date().toISOString().split('T')[0]).trim(),
      image: String(art.image || 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=1200&q=80').trim(),
      excerpt: String(art.excerpt || '').trim(),
      content: String(art.content || '').trim(),
      updatedAt: Number(art.updatedAt) || 0,
      isCustom: true
    };
  }

  // Extract only custom or modified articles compared to built-in migrated articles
  function extractCustomDelta(list, migratedBase) {
    const migrated = Array.isArray(migratedBase) ? migratedBase : getMigratedArticles();
    const baseBySlug = new Map();
    migrated.forEach(a => {
      if (a && a.slug) baseBySlug.set(a.slug, a);
    });

    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach(item => {
      const clean = sanitizeArticle(item);
      if (!clean || seen.has(clean.slug)) return;
      const base = baseBySlug.get(clean.slug);
      if (!base) {
        seen.add(clean.slug);
        out.push(clean);
      } else {
        const changed =
          String(base.title || '').trim() !== clean.title ||
          String(base.category || '').trim() !== clean.category ||
          String(base.image || '').trim() !== clean.image ||
          String(base.excerpt || '').trim() !== clean.excerpt ||
          String(base.content || '').trim() !== clean.content ||
          Number(clean.updatedAt || 0) > Number(base.updatedAt || 0);
        if (changed) {
          seen.add(clean.slug);
          out.push(clean);
        }
      }
    });
    return out;
  }

  function normalizeDeletedList(rawList) {
    const map = new Map();
    (Array.isArray(rawList) ? rawList : []).forEach(entry => {
      if (typeof entry === 'string' && entry.trim()) {
        const slug = entry.trim();
        if (!map.has(slug)) map.set(slug, { slug, deletedAt: 1 });
      } else if (entry && typeof entry === 'object' && entry.slug) {
        const slug = String(entry.slug).trim();
        const ts = Number(entry.deletedAt) || 1;
        const prev = map.get(slug);
        if (!prev || ts > prev.deletedAt) {
          map.set(slug, { slug, deletedAt: ts });
        }
      }
    });
    return Array.from(map.values());
  }

  function readLocalCustomSync() {
    const raw = safeParseJson(localStorage.getItem(LS_CUSTOM_KEY) || '[]', []);
    const pending = readPendingSyncList();
    const delta = extractCustomDelta(raw.concat(pending));
    if (Array.isArray(raw) && raw.length > delta.length + 10) {
      try { localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(delta)); } catch (e) {}
    }
    return delta;
  }

  function readLocalDeletedSync() {
    const raw = safeParseJson(localStorage.getItem(LS_DELETED_KEY) || '[]', []);
    return normalizeDeletedList(raw);
  }

  function readPendingSyncList() {
    const raw = safeParseJson(localStorage.getItem(LS_PENDING_KEY) || '[]', []);
    return extractCustomDelta(raw);
  }

  function writePendingSyncList(list) {
    const clean = extractCustomDelta(list);
    try {
      localStorage.setItem(LS_PENDING_KEY, JSON.stringify(clean));
    } catch (e) {}
    return clean;
  }

  function getPendingSyncCount() {
    return readPendingSyncList().length;
  }

  function writeLocalSync(customBlogs, deletedList) {
    const cleanCustom = extractCustomDelta(customBlogs);
    const cleanDeleted = normalizeDeletedList(deletedList);
    try {
      localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(cleanCustom));
    } catch (e) {}
    try {
      localStorage.setItem(LS_DELETED_KEY, JSON.stringify(cleanDeleted));
    } catch (e) {}
    // Keep session cache up to date
    sessionCustomCache = new Map();
    cleanCustom.forEach(a => sessionCustomCache.set(a.slug, a));
    sessionDeletedCache = new Map();
    cleanDeleted.forEach(d => sessionDeletedCache.set(d.slug, d.deletedAt));
  }

  function updateSessionCache(customBlogs, deletedList) {
    extractCustomDelta(customBlogs).forEach(a => {
      const prev = sessionCustomCache.get(a.slug);
      if (!prev || (a.updatedAt || 0) >= (prev.updatedAt || 0)) {
        sessionCustomCache.set(a.slug, a);
      }
    });
    normalizeDeletedList(deletedList).forEach(d => {
      const prev = sessionDeletedCache.get(d.slug) || 0;
      if (d.deletedAt >= prev) sessionDeletedCache.set(d.slug, d.deletedAt);
    });
  }

  function openIdb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'));
      try {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = function (ev) {
          const db = ev.target.result;
          if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE, { keyPath: 'key' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IDB open failed')); };
      } catch (e) {
        reject(e);
      }
    });
  }

  async function idbGet(key, fallback) {
    try {
      const db = await openIdb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
        req.onerror = () => resolve(fallback);
      });
    } catch (e) {
      return fallback;
    }
  }

  async function idbSet(key, value) {
    try {
      const db = await openIdb();
      return await new Promise((resolve) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        store.put({ key, value, savedAt: Date.now() });
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  }

  function mergeArticles(migratedList, customList, deletedList, builtinList) {
    const migrated = Array.isArray(migratedList) ? migratedList : getMigratedArticles();
    const custom = extractCustomDelta(customList, migrated);
    const deletedEntries = normalizeDeletedList(deletedList);
    const deletedMap = new Map();
    deletedEntries.forEach(d => deletedMap.set(d.slug, d.deletedAt));

    const map = new Map();
    // 1. Custom / user-authored articles first (sorted newest updatedAt first)
    custom
      .slice()
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .forEach(a => {
        const delTs = deletedMap.get(a.slug) || 0;
        if (delTs > (a.updatedAt || 0)) return;
        map.set(a.slug, a);
      });
    // 2. Migrated articles
    migrated.forEach(a => {
      if (!a || !a.slug) return;
      if (deletedMap.has(a.slug) && !map.has(a.slug)) return;
      if (!map.has(a.slug)) map.set(a.slug, a);
    });
    // 3. Optional builtin fallback articles
    if (Array.isArray(builtinList)) {
      builtinList.forEach(a => {
        if (!a || !a.slug) return;
        if (deletedMap.has(a.slug) && !map.has(a.slug)) return;
        if (!map.has(a.slug)) map.set(a.slug, a);
      });
    }
    return Array.from(map.values());
  }

  function mergeBlogSources(sources) {
    const customMap = new Map();
    const deletedMap = new Map();

    (sources || []).forEach(src => {
      if (!src) return;
      normalizeDeletedList(src.deletedSlugs).forEach(d => {
        const prev = deletedMap.get(d.slug) || 0;
        if (d.deletedAt >= prev) deletedMap.set(d.slug, d.deletedAt);
      });
    });

    (sources || []).forEach(src => {
      if (!src) return;
      extractCustomDelta(src.customBlogs).forEach(art => {
        const delTs = deletedMap.get(art.slug) || 0;
        if (delTs > (art.updatedAt || 0)) return;
        const existing = customMap.get(art.slug);
        if (!existing || (art.updatedAt || 0) >= (existing.updatedAt || 0)) {
          customMap.set(art.slug, art);
        }
      });
    });

    const customBlogs = Array.from(customMap.values()).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const deletedSlugs = Array.from(deletedMap.entries()).map(([slug, deletedAt]) => ({ slug, deletedAt }));
    return { customBlogs, deletedSlugs };
  }

  function cacheBustUrl(baseUrl) {
    reqSeq = (reqSeq + 1) % 1000000;
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    return baseUrl + sep + '_cb=' + Date.now() + '_' + reqSeq + '_' + Math.random().toString(36).slice(2, 7);
  }

  function waitMs(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const opts = Object.assign({ cache: 'no-store' }, options || {});
    if (typeof AbortController === 'undefined') {
      return await fetch(url, opts);
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      try { ctrl.abort(); } catch (e) {}
    }, timeoutMs || 12000);
    opts.signal = ctrl.signal;
    try {
      return await fetch(url, opts);
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchKvdbKey(key, attempts) {
    const tries = Math.max(1, attempts || 2);
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetchWithTimeout(
          cacheBustUrl(CLOUD_SYNC_BASE + '/' + encodeURIComponent(key)),
          { cache: 'no-store' },
          11000
        );
        if (res.status === 404) {
          return { ok: true, notFound: true, status: 404, data: null };
        }
        if (res.ok) {
          const data = await res.json().catch(() => null);
          return { ok: true, notFound: false, status: res.status, data };
        }
      } catch (e) {}
      if (i < tries - 1) await waitMs(250 * (i + 1));
    }
    return { ok: false, notFound: false, status: 0, data: null };
  }

  async function fetchServerJsonSafe(url) {
    try {
      const res = await fetchWithTimeout(cacheBustUrl(url), { cache: 'no-store' }, 8000);
      if (!res || !res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function pushToKvdb(key, data, maxAttempts) {
    const tries = Math.max(1, maxAttempts || 3);
    const body = JSON.stringify(data);
    for (let i = 0; i < tries; i++) {
      try {
        const res = await fetchWithTimeout(
          CLOUD_SYNC_BASE + '/' + encodeURIComponent(key),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: body
          },
          14000
        );
        if (res && res.ok) return true;
      } catch (e) {}
      if (i < tries - 1) await waitMs(350 * (i + 1));
    }
    return false;
  }

  async function deleteFromKvdb(key) {
    try {
      const res = await fetchWithTimeout(
        CLOUD_SYNC_BASE + '/' + encodeURIComponent(key),
        { method: 'DELETE' },
        8000
      );
      return Boolean(res && (res.ok || res.status === 404));
    } catch (e) {
      return false;
    }
  }

  async function pushToServerApi(payload) {
    try {
      const res = await fetchWithTimeout(
        '/api/blogs',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        },
        10000
      );
      if (!res || !res.ok) return false;
      const json = await res.json().catch(() => null);
      return Boolean(json && json.persistedToDisk === true);
    } catch (e) {
      return false;
    }
  }

  function buildManifest(customBlogs) {
    return extractCustomDelta(customBlogs).map(a => ({
      slug: a.slug,
      title: a.title,
      date: a.date,
      updatedAt: Number(a.updatedAt) || 0
    }));
  }

  function mergeManifestEntries(rawManifest) {
    const map = new Map();
    (Array.isArray(rawManifest) ? rawManifest : []).forEach(entry => {
      if (!entry || !entry.slug) return;
      const slug = String(entry.slug).trim();
      const ts = Number(entry.updatedAt) || 0;
      const prev = map.get(slug);
      if (!prev || ts >= prev.updatedAt) {
        map.set(slug, { slug, updatedAt: ts });
      }
    });
    return Array.from(map.values());
  }

  async function hydrateShardedArticles(manifestList, knownCustomList, deletedList) {
    const deletedMap = new Map();
    normalizeDeletedList(deletedList).forEach(d => deletedMap.set(d.slug, d.deletedAt));

    const knownMap = new Map();
    extractCustomDelta(knownCustomList).forEach(a => knownMap.set(a.slug, a));

    const manifest = mergeManifestEntries(manifestList);
    const toFetch = manifest.filter(entry => {
      const delTs = deletedMap.get(entry.slug) || 0;
      if (delTs > entry.updatedAt) return false;
      const existing = knownMap.get(entry.slug);
      return !existing || entry.updatedAt > (existing.updatedAt || 0);
    });

    if (!toFetch.length) return [];

    const results = await Promise.all(
      toFetch.map(entry => fetchKvdbKey(cloudArticleKey(entry.slug), 2))
    );
    const loaded = [];
    results.forEach(res => {
      if (res && res.ok && !res.notFound && res.data) {
        const clean = sanitizeArticle(res.data);
        if (clean) loaded.push(clean);
      }
    });
    return loaded;
  }

  async function loadPersistedBlogs(options) {
    const opts = options || {};
    const localSource = {
      customBlogs: readLocalCustomSync(),
      deletedSlugs: readLocalDeletedSync()
    };
    const pendingList = readPendingSyncList();
    const sessionSource = {
      customBlogs: Array.from(sessionCustomCache.values()),
      deletedSlugs: Array.from(sessionDeletedCache.entries()).map(([slug, deletedAt]) => ({ slug, deletedAt }))
    };

    const [idbCustom, idbDeleted, idbPending, serverData, cloudCustomRes, cloudManifestRes, cloudDeletedRes] = await Promise.all([
      idbGet(LS_CUSTOM_KEY, []),
      idbGet(LS_DELETED_KEY, []),
      idbGet(LS_PENDING_KEY, []),
      fetchServerJsonSafe('/api/blogs'),
      fetchKvdbKey('custom_blogs', 2),
      fetchKvdbKey('blog_manifest_v2', 2),
      fetchKvdbKey('deleted_blog_slugs', 2)
    ]);

    const idbSource = {
      customBlogs: Array.isArray(idbCustom) ? idbCustom : [],
      deletedSlugs: Array.isArray(idbDeleted) ? idbDeleted : []
    };
    const pendingSource = {
      customBlogs: pendingList.concat(Array.isArray(idbPending) ? idbPending : []),
      deletedSlugs: []
    };

    const serverSource = Array.isArray(serverData)
      ? { customBlogs: serverData, deletedSlugs: [] }
      : (serverData && typeof serverData === 'object'
        ? {
            customBlogs: Array.isArray(serverData.customBlogs) ? serverData.customBlogs : [],
            deletedSlugs: Array.isArray(serverData.deletedSlugs) ? serverData.deletedSlugs : []
          }
        : { customBlogs: [], deletedSlugs: [] });

    const cloudLegacyArticles = (cloudCustomRes.ok && Array.isArray(cloudCustomRes.data)) ? cloudCustomRes.data : [];
    const cloudDeletedEntries = (cloudDeletedRes.ok && Array.isArray(cloudDeletedRes.data)) ? cloudDeletedRes.data : [];
    const cloudManifestEntries = (cloudManifestRes.ok && Array.isArray(cloudManifestRes.data)) ? cloudManifestRes.data : [];

    // Hydrate any per-article v2 shards missing from or newer than custom_blogs
    const shardedArticles = await hydrateShardedArticles(
      cloudManifestEntries,
      cloudLegacyArticles,
      cloudDeletedEntries.concat(localSource.deletedSlugs, idbSource.deletedSlugs, sessionSource.deletedSlugs)
    );

    const cloudSource = {
      customBlogs: cloudLegacyArticles.concat(shardedArticles),
      deletedSlugs: cloudDeletedEntries
    };

    const merged = mergeBlogSources([
      localSource,
      idbSource,
      pendingSource,
      sessionSource,
      serverSource,
      cloudSource
    ]);

    writeLocalSync(merged.customBlogs, merged.deletedSlugs);
    await Promise.all([
      idbSet(LS_CUSTOM_KEY, merged.customBlogs),
      idbSet(LS_DELETED_KEY, merged.deletedSlugs)
    ]);

    const cloudReadHealthy = cloudCustomRes.ok && cloudManifestRes.ok && cloudDeletedRes.ok;

    // Check which custom blogs are missing or outdated in cloud shards/legacy list
    const cloudMap = new Map();
    extractCustomDelta(cloudSource.customBlogs).forEach(a => cloudMap.set(a.slug, a));
    const manifestMap = new Map();
    mergeManifestEntries(cloudManifestEntries).forEach(m => manifestMap.set(m.slug, m.updatedAt));

    const missingInCloud = merged.customBlogs.filter(a => {
      const c = cloudMap.get(a.slug);
      const mTs = manifestMap.get(a.slug);
      return !c || (a.updatedAt || 0) > (c.updatedAt || 0) || mTs === undefined || (a.updatedAt || 0) > mTs;
    });

    let cloudSyncedNow = cloudReadHealthy && missingInCloud.length === 0;

    // Automatically push any unsynced local/IDB/pending articles up to cloud shards + mirror
    const shouldReconcileCloud = Boolean(
      (opts.reconcile || pendingSource.customBlogs.length > 0 || opts.autoFlushPending) &&
      (missingInCloud.length > 0 || (opts.refreshCloudTtl && merged.customBlogs.length > 0))
    );

    if (shouldReconcileCloud && cloudReadHealthy) {
      const shardOkArr = await Promise.all(
        (opts.refreshCloudTtl && missingInCloud.length === 0 ? merged.customBlogs : missingInCloud)
          .map(art => pushToKvdb(cloudArticleKey(art.slug), art, 3))
      );
      const [listOk, manifestOk, delOk] = await Promise.all([
        pushToKvdb('custom_blogs', merged.customBlogs, 3),
        pushToKvdb('blog_manifest_v2', buildManifest(merged.customBlogs), 3),
        merged.deletedSlugs.length ? pushToKvdb('deleted_blog_slugs', merged.deletedSlugs, 3) : Promise.resolve(true)
      ]);
      const allShardsOk = shardOkArr.every(Boolean);
      if (allShardsOk && listOk && manifestOk && delOk) {
        writePendingSyncList([]);
        await idbSet(LS_PENDING_KEY, []);
        cloudSyncedNow = true;
      }
    } else if (shouldReconcileCloud && missingInCloud.length > 0) {
      // Cloud list GET failed; still safely push individual shards without overwriting custom_blogs!
      await Promise.all(
        missingInCloud.map(art => pushToKvdb(cloudArticleKey(art.slug), art, 3))
      );
    }

    if (opts.reconcile && merged.customBlogs.length && serverSource.customBlogs.length < merged.customBlogs.length) {
      pushToServerApi({
        mode: 'sync',
        customBlogs: merged.customBlogs,
        deletedSlugs: merged.deletedSlugs
      });
    }

    return {
      customBlogs: merged.customBlogs,
      deletedSlugs: merged.deletedSlugs,
      articles: mergeArticles(getMigratedArticles(), merged.customBlogs, merged.deletedSlugs, opts.builtinArticles),
      cloudReadHealthy,
      cloudSynced: cloudSyncedNow,
      pendingCount: getPendingSyncCount()
    };
  }

  async function saveCustomArticle(articleInput, origSlug) {
    const clean = sanitizeArticle(Object.assign({}, articleInput, {
      slug: normalizeSlug(articleInput && articleInput.slug),
      updatedAt: Number(articleInput && articleInput.updatedAt) || Date.now()
    }));
    if (!clean) throw new Error('Invalid article data');

    // Queue immediately locally + IDB so nothing is ever lost even if tab closes mid-request
    let pendingList = readPendingSyncList().filter(a => a.slug !== clean.slug && (!origSlug || a.slug !== origSlug));
    pendingList.unshift(clean);
    pendingList = writePendingSyncList(pendingList);
    updateSessionCache([clean], []);

    // Fetch latest cloud + local + IDB + server state first so we merge safely
    const current = await loadPersistedBlogs();
    let customBlogs = current.customBlogs.slice();
    let deletedSlugs = current.deletedSlugs.filter(d => d.slug !== clean.slug);

    if (origSlug && origSlug !== clean.slug) {
      customBlogs = customBlogs.filter(a => a.slug !== origSlug);
    }
    customBlogs = customBlogs.filter(a => a.slug !== clean.slug);
    customBlogs.unshift(clean);

    // Save locally + IndexedDB immediately
    writeLocalSync(customBlogs, deletedSlugs);
    const savedIdb = await Promise.all([
      idbSet(LS_CUSTOM_KEY, customBlogs),
      idbSet(LS_DELETED_KEY, deletedSlugs),
      idbSet(LS_PENDING_KEY, pendingList)
    ]).then(r => Boolean(r[0]));

    // 1. Always save per-article cloud shard (safe even if custom_blogs GET had failed!)
    // 2. Save full mirror + manifest + deletions if cloud read was healthy (or merge did not shrink)
    const [savedServer, savedShard, savedManifest, savedCloudCustom, savedCloudDeleted] = await Promise.all([
      pushToServerApi({ mode: 'upsert', article: clean, origSlug: origSlug || '', customBlogs, deletedSlugs }),
      pushToKvdb(cloudArticleKey(clean.slug), clean, 3),
      current.cloudReadHealthy ? pushToKvdb('blog_manifest_v2', buildManifest(customBlogs), 3) : Promise.resolve(false),
      current.cloudReadHealthy ? pushToKvdb('custom_blogs', customBlogs, 3) : Promise.resolve(false),
      current.cloudReadHealthy ? pushToKvdb('deleted_blog_slugs', deletedSlugs, 3) : Promise.resolve(true)
    ]);

    if (origSlug && origSlug !== clean.slug) {
      deleteFromKvdb(cloudArticleKey(origSlug));
    }

    const fullySyncedToCloud = Boolean(savedShard && savedManifest && savedCloudCustom && savedCloudDeleted);
    if (fullySyncedToCloud) {
      const remainingPending = writePendingSyncList(readPendingSyncList().filter(a => a.slug !== clean.slug));
      await idbSet(LS_PENDING_KEY, remainingPending);
    }

    return {
      article: clean,
      customBlogs,
      deletedSlugs,
      articles: mergeArticles(getMigratedArticles(), customBlogs, deletedSlugs),
      status: {
        savedLocal: true,
        savedIndexedDb: Boolean(savedIdb),
        savedServer: Boolean(savedServer),
        savedCloud: fullySyncedToCloud,
        savedCloudShard: Boolean(savedShard),
        pendingSyncCount: getPendingSyncCount()
      }
    };
  }

  async function deleteCustomArticle(slugInput) {
    const targetSlug = String(slugInput || '').trim();
    if (!targetSlug) return null;

    const delAt = Date.now();
    updateSessionCache([], [{ slug: targetSlug, deletedAt: delAt }]);
    sessionCustomCache.delete(targetSlug);

    const current = await loadPersistedBlogs();
    const customBlogs = current.customBlogs.filter(a => a.slug !== targetSlug);
    const deletedSlugs = current.deletedSlugs.filter(d => d.slug !== targetSlug);
    deletedSlugs.push({ slug: targetSlug, deletedAt: delAt });

    writeLocalSync(customBlogs, deletedSlugs);
    const remainingPending = writePendingSyncList(readPendingSyncList().filter(a => a.slug !== targetSlug));

    const serverDeleteOk = await (async () => {
      try {
        const res = await fetchWithTimeout('/api/blogs/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: targetSlug, customBlogs, deletedSlugs })
        }, 10000);
        if (!res || !res.ok) return false;
        const json = await res.json().catch(() => null);
        return Boolean(json && json.persistedToDisk === true);
      } catch (e) {
        return false;
      }
    })();

    const [, shardDelOk, manifestOk, cloudCustomOk, cloudDelOk] = await Promise.all([
      Promise.all([
        idbSet(LS_CUSTOM_KEY, customBlogs),
        idbSet(LS_DELETED_KEY, deletedSlugs),
        idbSet(LS_PENDING_KEY, remainingPending)
      ]),
      deleteFromKvdb(cloudArticleKey(targetSlug)),
      current.cloudReadHealthy ? pushToKvdb('blog_manifest_v2', buildManifest(customBlogs), 3) : Promise.resolve(false),
      current.cloudReadHealthy ? pushToKvdb('custom_blogs', customBlogs, 3) : Promise.resolve(false),
      current.cloudReadHealthy ? pushToKvdb('deleted_blog_slugs', deletedSlugs, 3) : Promise.resolve(false)
    ]);

    return {
      customBlogs,
      deletedSlugs,
      articles: mergeArticles(getMigratedArticles(), customBlogs, deletedSlugs),
      status: {
        savedServer: serverDeleteOk,
        savedCloud: Boolean(shardDelOk && manifestOk && cloudCustomOk && cloudDelOk)
      }
    };
  }

  async function syncAllBlogsToCloud() {
    const current = await loadPersistedBlogs({ reconcile: true, refreshCloudTtl: true });
    if (!current.cloudReadHealthy) {
      // Even if a GET failed, push shards for pending articles safely
      const pending = readPendingSyncList();
      await Promise.all(pending.map(a => pushToKvdb(cloudArticleKey(a.slug), a, 3)));
      return {
        customCount: current.customBlogs.length,
        totalCount: current.articles.length,
        savedCloud: false,
        savedServer: false,
        pendingCount: getPendingSyncCount()
      };
    }

    const [shardOkArr, manifestOk, cloudCustomOk, cloudDelOk, serverOk] = await Promise.all([
      Promise.all(current.customBlogs.map(a => pushToKvdb(cloudArticleKey(a.slug), a, 3))).then(arr => arr.every(Boolean)),
      pushToKvdb('blog_manifest_v2', buildManifest(current.customBlogs), 3),
      pushToKvdb('custom_blogs', current.customBlogs, 3),
      pushToKvdb('deleted_blog_slugs', current.deletedSlugs, 3),
      pushToServerApi({ mode: 'sync', customBlogs: current.customBlogs, deletedSlugs: current.deletedSlugs })
    ]);

    const savedCloud = Boolean(shardOkArr && manifestOk && cloudCustomOk && cloudDelOk);
    if (savedCloud) {
      writePendingSyncList([]);
      await idbSet(LS_PENDING_KEY, []);
    }

    return {
      customCount: current.customBlogs.length,
      totalCount: current.articles.length,
      savedCloud,
      savedServer: Boolean(serverOk),
      pendingCount: getPendingSyncCount()
    };
  }

  async function flushPendingBlogSync() {
    if (!getPendingSyncCount()) return { flushed: 0, remaining: 0 };
    const res = await syncAllBlogsToCloud();
    return {
      flushed: res.savedCloud ? 1 : 0,
      remaining: getPendingSyncCount(),
      savedCloud: res.savedCloud
    };
  }

  function hasArticleSlug(slug, articlesList) {
    const clean = String(slug || '').trim().toLowerCase();
    if (!clean) return false;
    const pool = Array.isArray(articlesList) ? articlesList : mergeArticles(getMigratedArticles(), readLocalCustomSync(), readLocalDeletedSync());
    return pool.some(a => a && String(a.slug || '').trim().toLowerCase() === clean);
  }

  function suggestUniqueSlug(baseInput, articlesList) {
    const base = normalizeSlug(baseInput);
    const pool = Array.isArray(articlesList) ? articlesList : mergeArticles(getMigratedArticles(), readLocalCustomSync(), readLocalDeletedSync());
    const used = new Set(pool.map(a => a && String(a.slug || '').trim().toLowerCase()).filter(Boolean));
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(base + '-' + n) && n < 1000) n++;
    return base + '-' + n;
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('online', function () {
      if (getPendingSyncCount() > 0) {
        flushPendingBlogSync();
      }
    });
  }

  global.FixflyBlogStore = {
    CLOUD_SYNC_BASE,
    LS_CUSTOM_KEY,
    LS_DELETED_KEY,
    LS_PENDING_KEY,
    cloudArticleKey,
    normalizeSlug,
    hasArticleSlug,
    suggestUniqueSlug,
    getPendingSyncCount,
    extractCustomDelta,
    readLocalCustomSync,
    readLocalDeletedSync,
    mergeArticles,
    loadPersistedBlogs,
    saveCustomArticle,
    deleteCustomArticle,
    syncAllBlogsToCloud,
    flushPendingBlogSync
  };
})(window);
