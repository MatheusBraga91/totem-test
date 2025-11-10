/**
 * Service Worker for Totem Kiosk App
 * Implements version-based cache system for automatic updates
 * 
 * IMPORTANT: When updating version.json, also update this comment to trigger new SW installation
 * Current version: 20241201120000
 */

/**
 * Get assets list with correct base path
 * @returns {Array<string>} Array of asset URLs
 */
function getAssets() {
  const basePath = getBasePath();
  return [
    basePath + '/',
    basePath + '/index.html',
    basePath + '/style.css',
    basePath + '/main.js',
    basePath + '/media/video1.mp4',
    basePath + '/media/image1.png',
    basePath + '/manifest.json',
    basePath + '/version.json'
  ];
}

// Default cache name (will be updated with version)
let CACHE_NAME = 'totem-cache-v3';
let CURRENT_VERSION = null;

// Store base path once determined
let BASE_PATH = null;

/**
 * Get the base path from the service worker scope
 * @returns {string} Base path (e.g., '/totem-test' or '')
 */
function getBasePath() {
  if (BASE_PATH !== null) {
    return BASE_PATH;
  }
  
  try {
    // Try to get from registration scope first
    if (self.registration && self.registration.scope) {
      const scopeUrl = new URL(self.registration.scope);
      BASE_PATH = scopeUrl.pathname.replace(/\/$/, '') || '';
      return BASE_PATH;
    }
    
    // Fallback: use service worker script location
    if (self.location && self.location.pathname) {
      // Remove the service-worker.js filename
      BASE_PATH = self.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '') || '';
      return BASE_PATH;
    }
    
    return '';
  } catch (error) {
    console.warn('Error determining base path:', error);
    return '';
  }
}

/**
 * Fetch version.json and extract version number
 * @returns {Promise<string>} Version string or null if fetch fails
 */
async function fetchVersion() {
  try {
    const basePath = getBasePath();
    const versionUrl = basePath + '/version.json?t=' + Date.now();
    const response = await fetch(versionUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to fetch version');
    const data = await response.json();
    return data.version || null;
  } catch (error) {
    console.warn('Failed to fetch version.json:', error);
    return null;
  }
}

/**
 * Get cached version from existing cache
 * @returns {Promise<string>} Cached version or null
 */
async function getCachedVersion() {
  try {
    const cacheNames = await caches.keys();
    // Find the most recent cache
    const totemCaches = cacheNames.filter(name => name.startsWith('totem-cache-'));
    if (totemCaches.length === 0) return null;
    
    // Get version from the cache name (format: totem-cache-YYYYMMDDHHMMSS)
    const latestCache = totemCaches.sort().reverse()[0];
    const versionMatch = latestCache.match(/totem-cache-(.+)/);
    if (versionMatch) {
      return versionMatch[1];
    }
    
    // Fallback: try to read from cached version.json
    const cache = await caches.open(latestCache);
    const cachedVersionFile = await cache.match('/version.json');
    if (cachedVersionFile) {
      const data = await cachedVersionFile.json();
      return data.version || null;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to get cached version:', error);
    return null;
  }
}

/**
 * Initialize cache name based on version
 */
async function initializeCacheName() {
  // Try to fetch version from network first
  const onlineVersion = await fetchVersion();
  
  if (onlineVersion) {
    CURRENT_VERSION = onlineVersion;
    CACHE_NAME = 'totem-cache-' + onlineVersion;
    console.log('Using online version:', CURRENT_VERSION);
    return;
  }
  
  // If offline, try to get cached version
  const cachedVersion = await getCachedVersion();
  if (cachedVersion) {
    CURRENT_VERSION = cachedVersion;
    CACHE_NAME = 'totem-cache-' + cachedVersion;
    console.log('Using cached version:', CURRENT_VERSION);
    return;
  }
  
  // Fallback to default
  CACHE_NAME = 'totem-cache-v1';
  console.log('Using default cache name');
}

/**
 * Check if a new version is available
 * @returns {Promise<boolean>} True if new version detected
 */
async function checkForUpdate() {
  try {
    const onlineVersion = await fetchVersion();
    if (!onlineVersion) return false;
    
    const cachedVersion = await getCachedVersion();
    if (!cachedVersion) return true; // No cache means we need to install
    
    return onlineVersion !== cachedVersion;
  } catch (error) {
    console.warn('Error checking for update:', error);
    return false;
  }
}

// Install event - precache all assets with version-based cache
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    (async () => {
      // Initialize base path from service worker location
      if (BASE_PATH === null && self.location && self.location.pathname) {
        BASE_PATH = self.location.pathname.replace(/\/[^/]*$/, '').replace(/\/$/, '') || '';
        console.log('Base path determined:', BASE_PATH);
      }
      
      // Initialize cache name based on version
      await initializeCacheName();
      
      // Get assets with correct base path
      const assets = getAssets();
      
      // Open cache and add all assets
      const cache = await caches.open(CACHE_NAME);
      console.log('Caching assets with cache name:', CACHE_NAME);
      console.log('Assets to cache:', assets);
      
      try {
        await cache.addAll(assets);
        console.log('All assets cached successfully');
      } catch (error) {
        console.error('Error caching assets:', error);
        // Cache individual assets if addAll fails
        for (const asset of assets) {
          try {
            await cache.add(asset);
          } catch (err) {
            console.warn('Failed to cache:', asset, err);
          }
        }
      }
      
      // Force activation of new service worker
      self.skipWaiting();
    })()
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    (async () => {
      // Ensure cache name is initialized
      if (!CURRENT_VERSION) {
        await initializeCacheName();
      }
      
      // Delete all caches that don't match current version
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => 
        name.startsWith('totem-cache-') && name !== CACHE_NAME
      );
      
      console.log('Deleting old caches:', oldCaches);
      await Promise.all(oldCaches.map(name => caches.delete(name)));
      
      // Take control of all clients immediately
      await self.clients.claim();
      console.log('Service Worker activated with cache:', CACHE_NAME);
    })()
  );
});

// Fetch event - serve from cache, update in background when online
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http requests
  if (!event.request.url.startsWith('http')) return;
  
  // Special handling for version.json - always fetch fresh from network
  const url = new URL(event.request.url);
  const basePath = getBasePath();
  if (url.pathname === basePath + '/version.json' || url.pathname.endsWith('/version.json')) {
    event.respondWith(
      (async () => {
        try {
          // Always fetch fresh from network (bypass cache)
          const networkResponse = await fetch(event.request, { 
            cache: 'no-store',
            headers: {
              'Cache-Control': 'no-cache'
            }
          });
          
          if (networkResponse && networkResponse.ok) {
            // Update cache with fresh version
            const cache = await caches.open(CACHE_NAME);
            await cache.put(event.request, networkResponse.clone());
          }
          
          return networkResponse;
        } catch (error) {
          // If network fails, try cache as fallback
          const cachedResponse = await caches.match(event.request);
          if (cachedResponse) {
            return cachedResponse;
          }
          // If no cache, return error
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        }
      })()
    );
    return;
  }
  
  event.respondWith(
    (async () => {
      // Always try cache first for offline support
      const cachedResponse = await caches.match(event.request);
      
      // If we have a cached response, serve it immediately
      if (cachedResponse) {
        // In background, try to update cache (fetch will fail if offline)
        fetch(event.request)
          .then(response => {
            if (response && response.ok) {
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response.clone());
              });
            }
          })
          .catch(() => {
            // Network error, keep using cache (offline or network failure)
          });
        return cachedResponse;
      }
      
      // Not in cache, try network
      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse && networkResponse.ok) {
          // Cache the response for future use
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        return networkResponse;
      } catch (error) {
        // Network failed, return offline response
        console.warn('Network request failed:', event.request.url);
        return new Response('Offline', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      }
    })()
  );
});

/**
 * Update all cached assets when version changes
 * This is a fallback mechanism - for full SW update, service-worker.js must change
 */
async function updateCacheForNewVersion(newVersion) {
  try {
    const newCacheName = 'totem-cache-' + newVersion;
    const newCache = await caches.open(newCacheName);
    
    console.log('Updating cache for new version:', newVersion);
    
    // Get assets with correct base path
    const assets = getAssets();
    
    // Cache all assets with new version
    for (const asset of assets) {
      try {
        const response = await fetch(asset);
        if (response && response.ok) {
          await newCache.put(asset, response.clone());
        }
      } catch (err) {
        console.warn('Failed to update asset:', asset, err);
      }
    }
    
    // Update CACHE_NAME and delete old caches
    const oldCacheName = CACHE_NAME;
    CACHE_NAME = newCacheName;
    CURRENT_VERSION = newVersion;
    
    // Delete old cache
    await caches.delete(oldCacheName);
    console.log('Cache updated successfully to version:', newVersion);
    
    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type: 'CACHE_UPDATED', version: newVersion });
    });
  } catch (error) {
    console.error('Error updating cache for new version:', error);
  }
}

// Handle messages from client
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_VERSION') {
    checkForUpdate().then(async hasUpdate => {
      if (hasUpdate) {
        const onlineVersion = await fetchVersion();
        if (onlineVersion) {
          // Update cache even if SW file hasn't changed
          await updateCacheForNewVersion(onlineVersion);
          
          // Notify clients that update is available
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({ 
              type: 'UPDATE_AVAILABLE',
              version: onlineVersion 
            });
          });
        }
      }
    });
  } else if (event.data && event.data.type === 'UPDATE_VERSION') {
    // Client detected version change, update cache immediately
    const newVersion = event.data.version;
    if (newVersion) {
      console.log('Updating cache for new version from client:', newVersion);
      updateCacheForNewVersion(newVersion).then(() => {
        // Notify client that cache is updated
        event.ports && event.ports[0] && event.ports[0].postMessage({ 
          type: 'CACHE_UPDATE_COMPLETE',
          version: newVersion 
        });
      });
    }
  }
});
