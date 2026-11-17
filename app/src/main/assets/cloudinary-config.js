(function(globalScope) {
  'use strict';

  /**
   * Public (non-secret) Cloudinary configuration for FixFly.
   * API Secret must NEVER be stored in frontend files — use server environment
   * variables (CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET) for signed uploads,
   * or supply your Cloud Name + Unsigned Upload Preset below for static hosting.
   */
  const FIXFLY_CLOUDINARY_CONFIG = Object.assign({
    cloudName: 'muy6zdcd',
    uploadPreset: 'ml_default',
    folder: 'fixfly',
    maxFileSizeBytes: 10 * 1024 * 1024
  }, globalScope.FIXFLY_CLOUDINARY_CONFIG || {});

  let cachedResolvedConfig = null;

  function isCloudinaryUrl(url) {
    return typeof url === 'string' && /^https?:\/\/res\.cloudinary\.com\/[^/]+\//i.test(url.trim());
  }

  function optimizeUrl(url, options) {
    if (!url || typeof url !== 'string') return url;
    const trimmed = url.trim();
    if (!isCloudinaryUrl(trimmed)) return trimmed;

    const opts = options || {};
    const marker = '/image/upload/';
    const idx = trimmed.indexOf(marker);
    if (idx === -1) return trimmed;

    const prefix = trimmed.slice(0, idx + marker.length);
    const rest = trimmed.slice(idx + marker.length);
    const firstSegment = rest.split('/')[0] || '';
    if (firstSegment.includes('f_auto') || firstSegment.includes('q_auto')) {
      return trimmed;
    }

    const transforms = ['f_auto', 'q_auto'];
    if (opts.width && Number(opts.width) > 0) {
      transforms.push('w_' + Math.round(Number(opts.width)));
    }
    return prefix + transforms.join(',') + '/' + rest;
  }

  async function resolveConfig() {
    if (cachedResolvedConfig && cachedResolvedConfig.configured) {
      return cachedResolvedConfig;
    }

    const localCloudName = String(FIXFLY_CLOUDINARY_CONFIG.cloudName || '').trim();
    const localPreset = String(FIXFLY_CLOUDINARY_CONFIG.uploadPreset || '').trim();
    const defaultFolder = String(FIXFLY_CLOUDINARY_CONFIG.folder || 'fixfly').trim() || 'fixfly';

    if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
      try {
        const res = await fetch('/api/cloudinary-config?t=' + Date.now(), { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.cloudName) {
            cachedResolvedConfig = {
              configured: Boolean(data.configured),
              mode: data.mode || (data.uploadPreset ? 'unsigned' : 'unconfigured'),
              cloudName: String(data.cloudName || '').trim(),
              uploadPreset: String(data.uploadPreset || localPreset || '').trim(),
              folder: String(data.folder || defaultFolder).trim()
            };
            return cachedResolvedConfig;
          }
        }
      } catch (e) {}
    }

    cachedResolvedConfig = {
      configured: Boolean(localCloudName && localPreset),
      mode: (localCloudName && localPreset) ? 'unsigned' : 'unconfigured',
      cloudName: localCloudName,
      uploadPreset: localPreset,
      folder: defaultFolder
    };
    return cachedResolvedConfig;
  }

  function postMultipartWithProgress(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      if (typeof XMLHttpRequest === 'undefined') {
        reject(new Error('File upload requires browser XMLHttpRequest support.'));
        return;
      }
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.upload.onprogress = function(ev) {
        if (ev && ev.lengthComputable && typeof onProgress === 'function') {
          const pct = Math.min(99, Math.max(1, Math.round((ev.loaded / ev.total) * 100)));
          onProgress(pct);
        }
      };
      xhr.onload = function() {
        let parsed = null;
        try { parsed = JSON.parse(xhr.responseText || '{}'); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300 && parsed && parsed.secure_url) {
          if (typeof onProgress === 'function') onProgress(100);
          resolve({
            url: parsed.secure_url,
            optimizedUrl: optimizeUrl(parsed.secure_url),
            publicId: parsed.public_id || '',
            width: parsed.width || null,
            height: parsed.height || null,
            bytes: parsed.bytes || null
          });
        } else {
          const errMsg = (parsed && parsed.error && parsed.error.message)
            ? parsed.error.message
            : ('Cloudinary upload failed (HTTP ' + xhr.status + ').');
          reject(new Error(errMsg));
        }
      };
      xhr.onerror = function() {
        reject(new Error('Network error while uploading image to Cloudinary. Please check internet connection.'));
      };
      xhr.send(formData);
    });
  }

  async function uploadImage(file, options) {
    const opts = options || {};
    if (!file) throw new Error('No image file selected.');

    if (file.type && !file.type.startsWith('image/')) {
      throw new Error('Please choose a valid image file (JPG, PNG, WEBP, GIF).');
    }
    const maxBytes = FIXFLY_CLOUDINARY_CONFIG.maxFileSizeBytes || (10 * 1024 * 1024);
    if (file.size > maxBytes) {
      throw new Error('Image size must be 10 MB or smaller.');
    }

    const folder = String(opts.folder || FIXFLY_CLOUDINARY_CONFIG.folder || 'fixfly')
      .replace(/[^a-zA-Z0-9/_-]/g, '') || 'fixfly';
    const cfg = await resolveConfig();

    // 1. Prefer signed upload if backend signing endpoint is active
    if (typeof fetch === 'function' && typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
      try {
        const signRes = await fetch('/api/cloudinary-sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder })
        });
        if (signRes.ok) {
          const signData = await signRes.json();
          if (signData && signData.ok && signData.cloudName && signData.apiKey && signData.signature) {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('api_key', signData.apiKey);
            fd.append('timestamp', String(signData.timestamp));
            fd.append('signature', signData.signature);
            fd.append('folder', signData.folder || folder);
            return await postMultipartWithProgress(
              'https://api.cloudinary.com/v1_1/' + encodeURIComponent(signData.cloudName) + '/image/upload',
              fd,
              opts.onProgress
            );
          }
        }
      } catch (e) {
        // Fall through to unsigned upload preset if configured
      }
    }

    // 2. Static-host / WebView unsigned upload preset
    if (cfg && cfg.cloudName && cfg.uploadPreset) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('upload_preset', cfg.uploadPreset);
      fd.append('folder', folder);
      return await postMultipartWithProgress(
        'https://api.cloudinary.com/v1_1/' + encodeURIComponent(cfg.cloudName) + '/image/upload',
        fd,
        opts.onProgress
      );
    }

    throw new Error('Cloudinary upload is not activated yet. Share your Cloudinary Cloud Name and Unsigned Upload Preset (or API Key + API Secret) with support to link your nutrolix.in@gmail.com account.');
  }

  const api = {
    config: FIXFLY_CLOUDINARY_CONFIG,
    isCloudinaryUrl,
    optimizeUrl,
    resolveConfig,
    uploadImage
  };

  globalScope.FIXFLY_CLOUDINARY_CONFIG = FIXFLY_CLOUDINARY_CONFIG;
  globalScope.FixflyCloudinary = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
