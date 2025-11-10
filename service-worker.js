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
    basePath + '/media/video2.mp4',
    basePath + '/media/image2.png',
    basePath + '/manifest.json',
    basePath + '/version.json'
  ];
}

// Default cache name (will be updated with version)
let CACHE_NAME = 'totem-cache-v9';
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
      
      // Download all assets with cache busting to ensure fresh files
      const cacheTimestamp = Date.now();
      const installVersion = CURRENT_VERSION || 'install';
      
      try {
        // Try to cache all at once first
        await cache.addAll(assets);
        console.log('All assets cached successfully');
      } catch (error) {
        console.warn('Some assets failed to cache, downloading individually with cache busting:', error);
        
        // Download each asset individually with cache busting
        const cachePromises = assets.map(async (asset) => {
          try {
            // Add cache busting to force fresh download
            const cacheBustUrl = asset + (asset.includes('?') ? '&' : '?') + '_v=' + installVersion + '&_t=' + cacheTimestamp;
            const response = await fetch(cacheBustUrl, {
              cache: 'no-store',
              headers: {
                'Cache-Control': 'no-cache'
              }
            });
            
            if (response && response.ok) {
              // Store with original URL (without cache busting)
              await cache.put(asset, response.clone());
              console.log('✓ Cached:', asset);
              return { asset, success: true };
            } else {
              console.warn('✗ Failed to cache:', asset, 'Status:', response.status);
              return { asset, success: false };
            }
          } catch (err) {
            console.warn('✗ Error caching:', asset, err.message);
            return { asset, success: false };
          }
        });
        
        // Wait for all downloads
        const results = await Promise.allSettled(cachePromises);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        console.log(`Individual caching completed: ${successful}/${assets.length} successful`);
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
      
      // Delete ALL caches that don't match current version
      // This ensures no old files remain
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => 
        name.startsWith('totem-cache-') && name !== CACHE_NAME
      );
      
      if (oldCaches.length > 0) {
        console.log('Deleting old caches completely:', oldCaches);
        await Promise.all(oldCaches.map(name => {
          console.log('Deleting cache:', name);
          return caches.delete(name);
        }));
        console.log('✓ All old caches deleted');
      }
      
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
  
  const url = new URL(event.request.url);
  
  // Ignore favicon requests (browser automatically requests it)
  if (url.pathname.endsWith('/favicon.ico') || url.pathname === '/favicon.ico') {
    event.respondWith(new Response('', { status: 204 })); // No Content
    return;
  }
  
  // Special handling for version.json - always fetch fresh from network
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
      try {
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
                }).catch(err => {
                  console.warn('Failed to update cache:', err);
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
            // Cache the response for future use (but don't fail if caching fails)
            try {
              const cache = await caches.open(CACHE_NAME);
              await cache.put(event.request, networkResponse.clone());
            } catch (cacheError) {
              console.warn('Failed to cache response:', event.request.url, cacheError);
              // Continue even if caching fails
            }
          }
          return networkResponse;
        } catch (fetchError) {
          // Network failed, return offline response
          console.warn('Network request failed:', event.request.url, fetchError.message);
          
          // For media files, return a more graceful error
          if (event.request.url.match(/\.(mp4|webm|ogg|mp3|wav|avi|mov)$/i)) {
            return new Response('', {
              status: 404,
              statusText: 'Not Found'
            });
          }
          
          return new Response('Offline', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain' })
          });
        }
      } catch (error) {
        // Catch any unexpected errors to prevent service worker from breaking
        console.error('Unexpected error in fetch handler:', error);
        // Try to return cached version as last resort
        const fallbackCache = await caches.match(event.request);
        if (fallbackCache) {
          return fallbackCache;
        }
        // Return error response
        return new Response('Error', {
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers({ 'Content-Type': 'text/plain' })
        });
      }
    })()
  );
});

/**
 * Update all cached assets when version changes
 * Completely replaces old cache with new version - downloads ALL files fresh
 */
async function updateCacheForNewVersion(newVersion) {
  try {
    const newCacheName = 'totem-cache-' + newVersion;
    const oldCacheName = CACHE_NAME;
    
    console.log('Starting complete cache replacement for version:', newVersion);
    console.log('Old cache:', oldCacheName, '-> New cache:', newCacheName);
    
    // Get assets with correct base path
    const assets = getAssets();
    
    // Create new cache
    const newCache = await caches.open(newCacheName);
    
    // Download ALL assets fresh with cache busting to ensure we get new files
    const cacheTimestamp = Date.now();
    const downloadPromises = assets.map(async (asset) => {
      try {
        // Add cache busting parameter to force fresh download
        const cacheBustUrl = asset + (asset.includes('?') ? '&' : '?') + '_v=' + newVersion + '&_t=' + cacheTimestamp;
        const response = await fetch(cacheBustUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        
        if (response && response.ok) {
          // Store with original asset URL (without cache busting params)
          await newCache.put(asset, response.clone());
          console.log('✓ Downloaded and cached:', asset);
          return { asset, success: true };
        } else {
          console.warn('✗ Failed to download:', asset, 'Status:', response.status);
          return { asset, success: false };
        }
      } catch (err) {
        console.warn('✗ Error downloading:', asset, err.message);
        return { asset, success: false };
      }
    });
    
    // Wait for all downloads to complete
    const results = await Promise.allSettled(downloadPromises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    
    console.log(`Download complete: ${successful} successful, ${failed} failed`);
    
    // Only proceed if we got the essential files (at least index.html and main files)
    const essentialFiles = ['index.html', 'main.js', 'style.css', 'version.json'];
    const hasEssential = essentialFiles.some(file => {
      const asset = assets.find(a => a.includes(file));
      return results.some(r => r.status === 'fulfilled' && r.value.asset === asset && r.value.success);
    });
    
    if (!hasEssential) {
      console.error('Failed to download essential files, aborting cache update');
      await caches.delete(newCacheName);
      return;
    }
    
    // Now that new cache is complete, update CACHE_NAME and delete ALL old caches
    CACHE_NAME = newCacheName;
    CURRENT_VERSION = newVersion;
    
    // Delete the old cache and any other old caches
    const allCacheNames = await caches.keys();
    const oldCaches = allCacheNames.filter(name => 
      name.startsWith('totem-cache-') && name !== newCacheName
    );
    
    console.log('Deleting old caches:', oldCaches);
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    
    console.log('✓ Cache replacement complete! New version:', newVersion);
    console.log('✓ All old caches deleted');
    
    // Notify clients that cache update is complete
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ 
        type: 'CACHE_UPDATED', 
        version: newVersion,
        success: true
      });
    });
  } catch (error) {
    console.error('Error updating cache for new version:', error);
    
    // Notify clients of failure
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ 
        type: 'CACHE_UPDATE_FAILED', 
        error: error.message
      });
    });
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
