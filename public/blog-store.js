(function (global) {
  'use strict';

  const CLOUD_SYNC_BASE = 'https://kvdb.io/DEtS3yMR6BUsjGzjGvjSuP';
  const LS_CUSTOM_KEY = 'fixfly_custom_blogs';
  const LS_DELETED_KEY = 'fixfly_deleted_blog_slugs';
  const IDB_NAME = 'FixflyLifetimeBlogDB';
  const IDB_VERSION = 1;
  const IDB_STORE = 'blog_store';

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
  // Prevents bloating localStorage/kvdb with 500KB+ of unchanged migrated articles
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
    const delta = extractCustomDelta(raw);
    if (Array.isArray(raw) && raw.length > delta.length + 10) {
      // Compact legacy bloated localStorage that stored all 51 migrated articles
      try { localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(delta)); } catch (e) {}
    }
    return delta;
  }

  function readLocalDeletedSync() {
    const raw = safeParseJson(localStorage.getItem(LS_DELETED_KEY) || '[]', []);
    return normalizeDeletedList(raw);
  }

  function writeLocalSync(customBlogs, deletedList) {
    try {
      localStorage.setItem(LS_CUSTOM_KEY, JSON.stringify(extractCustomDelta(customBlogs)));
    } catch (e) {}
    try {
      localStorage.setItem(LS_DELETED_KEY, JSON.stringify(normalizeDeletedList(deletedList)));
    } catch (e) {}
  }

  // IndexedDB dual backup (survives partial localStorage resets)
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
    // 1. Custom / user-authored articles first so latest posts appear at the top
    custom.forEach(a => {
      const delTs = deletedMap.get(a.slug) || 0;
      if (delTs > (a.updatedAt || 0)) return;
      map.set(a.slug, a);
    });
    // 2. Migrated articles (unless edited in custom or deleted)
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

  async function fetchJsonSafe(url) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function pushToKvdb(key, data) {
    try {
      const res = await fetch(CLOUD_SYNC_BASE + '/' + key, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return Boolean(res && res.ok);
    } catch (e) {
      return false;
    }
  }

  async function pushToServerApi(payload) {
    try {
      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res || !res.ok) return false;
      const json = await res.json().catch(() => null);
      return Boolean(json && json.persistedToDisk === true);
    } catch (e) {
      return false;
    }
  }

  async function loadPersistedBlogs(options) {
    const opts = options || {};
    const localSource = {
      customBlogs: readLocalCustomSync(),
      deletedSlugs: readLocalDeletedSync()
    };

    const [idbCustom, idbDeleted, serverData, cloudCustom, cloudDeleted] = await Promise.all([
      idbGet(LS_CUSTOM_KEY, []),
      idbGet(LS_DELETED_KEY, []),
      fetchJsonSafe('/api/blogs?t=' + Date.now()),
      fetchJsonSafe(CLOUD_SYNC_BASE + '/custom_blogs?t=' + Date.now()),
      fetchJsonSafe(CLOUD_SYNC_BASE + '/deleted_blog_slugs?t=' + Date.now())
    ]);

    const idbSource = {
      customBlogs: Array.isArray(idbCustom) ? idbCustom : [],
      deletedSlugs: Array.isArray(idbDeleted) ? idbDeleted : []
    };

    const serverSource = Array.isArray(serverData)
      ? { customBlogs: serverData, deletedSlugs: [] }
      : (serverData && typeof serverData === 'object'
        ? {
            customBlogs: Array.isArray(serverData.customBlogs) ? serverData.customBlogs : [],
            deletedSlugs: Array.isArray(serverData.deletedSlugs) ? serverData.deletedSlugs : []
          }
        : { customBlogs: [], deletedSlugs: [] });

    const cloudSource = {
      customBlogs: Array.isArray(cloudCustom) ? cloudCustom : [],
      deletedSlugs: Array.isArray(cloudDeleted) ? cloudDeleted : []
    };

    const merged = mergeBlogSources([localSource, idbSource, serverSource, cloudSource]);

    writeLocalSync(merged.customBlogs, merged.deletedSlugs);
    await Promise.all([
      idbSet(LS_CUSTOM_KEY, merged.customBlogs),
      idbSet(LS_DELETED_KEY, merged.deletedSlugs)
    ]);

    // Self-heal missing layers when admin requests reconciliation
    if (opts.reconcile && merged.customBlogs.length) {
      const cloudCount = cloudSource.customBlogs.length;
      const serverCount = serverSource.customBlogs.length;
      if (cloudCount < merged.customBlogs.length || opts.refreshCloudTtl) {
        pushToKvdb('custom_blogs', merged.customBlogs);
        if (merged.deletedSlugs.length) {
          pushToKvdb('deleted_blog_slugs', merged.deletedSlugs);
        }
      }
      if (serverCount < merged.customBlogs.length) {
        pushToServerApi({
          mode: 'sync',
          customBlogs: merged.customBlogs,
          deletedSlugs: merged.deletedSlugs
        });
      }
    }

    return {
      customBlogs: merged.customBlogs,
      deletedSlugs: merged.deletedSlugs,
      articles: mergeArticles(getMigratedArticles(), merged.customBlogs, merged.deletedSlugs, opts.builtinArticles)
    };
  }

  async function saveCustomArticle(articleInput, origSlug) {
    const clean = sanitizeArticle(Object.assign({}, articleInput, {
      slug: normalizeSlug(articleInput && articleInput.slug),
      updatedAt: Date.now()
    }));
    if (!clean) throw new Error('Invalid article data');

    // Load latest merged state first so we never overwrite articles saved on other devices
    const current = await loadPersistedBlogs();
    let customBlogs = current.customBlogs.slice();
    let deletedSlugs = current.deletedSlugs.filter(d => d.slug !== clean.slug);

    if (origSlug && origSlug !== clean.slug) {
      customBlogs = customBlogs.filter(a => a.slug !== origSlug);
    }
    customBlogs = customBlogs.filter(a => a.slug !== clean.slug);
    customBlogs.unshift(clean);

    writeLocalSync(customBlogs, deletedSlugs);
    const [savedIdb, savedServer, savedCloudCustom] = await Promise.all([
      Promise.all([idbSet(LS_CUSTOM_KEY, customBlogs), idbSet(LS_DELETED_KEY, deletedSlugs)]).then(r => r[0]),
      pushToServerApi({ mode: 'upsert', article: clean, origSlug: origSlug || '', customBlogs, deletedSlugs }),
      pushToKvdb('custom_blogs', customBlogs),
      pushToKvdb('deleted_blog_slugs', deletedSlugs)
    ]);

    return {
      article: clean,
      customBlogs,
      deletedSlugs,
      articles: mergeArticles(getMigratedArticles(), customBlogs, deletedSlugs),
      status: {
        savedLocal: true,
        savedIndexedDb: Boolean(savedIdb),
        savedServer: Boolean(savedServer),
        savedCloud: Boolean(savedCloudCustom)
      }
    };
  }

  async function deleteCustomArticle(slugInput) {
    const targetSlug = String(slugInput || '').trim();
    if (!targetSlug) return null;

    const current = await loadPersistedBlogs();
    const customBlogs = current.customBlogs.filter(a => a.slug !== targetSlug);
    const deletedSlugs = current.deletedSlugs.filter(d => d.slug !== targetSlug);
    deletedSlugs.push({ slug: targetSlug, deletedAt: Date.now() });

    writeLocalSync(customBlogs, deletedSlugs);

    const serverDeleteOk = await (async () => {
      try {
        const res = await fetch('/api/blogs/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: targetSlug, customBlogs, deletedSlugs })
        });
        if (!res || !res.ok) return false;
        const json = await res.json().catch(() => null);
        return Boolean(json && json.persistedToDisk === true);
      } catch (e) {
        return false;
      }
    })();

    const [, cloudOk] = await Promise.all([
      Promise.all([idbSet(LS_CUSTOM_KEY, customBlogs), idbSet(LS_DELETED_KEY, deletedSlugs)]),
      pushToKvdb('custom_blogs', customBlogs),
      pushToKvdb('deleted_blog_slugs', deletedSlugs)
    ]);

    return {
      customBlogs,
      deletedSlugs,
      articles: mergeArticles(getMigratedArticles(), customBlogs, deletedSlugs),
      status: {
        savedServer: serverDeleteOk,
        savedCloud: Boolean(cloudOk)
      }
    };
  }

  async function syncAllBlogsToCloud() {
    const current = await loadPersistedBlogs({ reconcile: true, refreshCloudTtl: true });
    const [cloudCustomOk, cloudDelOk, serverOk] = await Promise.all([
      pushToKvdb('custom_blogs', current.customBlogs),
      pushToKvdb('deleted_blog_slugs', current.deletedSlugs),
      pushToServerApi({ mode: 'sync', customBlogs: current.customBlogs, deletedSlugs: current.deletedSlugs })
    ]);
    return {
      customCount: current.customBlogs.length,
      totalCount: current.articles.length,
      savedCloud: Boolean(cloudCustomOk && cloudDelOk),
      savedServer: Boolean(serverOk)
    };
  }

  global.FixflyBlogStore = {
    CLOUD_SYNC_BASE,
    LS_CUSTOM_KEY,
    LS_DELETED_KEY,
    normalizeSlug,
    extractCustomDelta,
    readLocalCustomSync,
    readLocalDeletedSync,
    mergeArticles,
    loadPersistedBlogs,
    saveCustomArticle,
    deleteCustomArticle,
    syncAllBlogsToCloud
  };
})(window);
