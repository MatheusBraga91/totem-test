/**
 * Canadian Sports Totem - Main Application Logic
 * Offline-first kiosk application for displaying Canadian sports history
 */

// Application state
const AppState = {
  currentDecade: null,
  decades: [
    { id: '1950s', label: '1950s', start: 1950, end: 1959 },
    { id: '1960s', label: '1960s', start: 1960, end: 1969 },
    { id: '1970s', label: '1970s', start: 1970, end: 1979 },
    { id: '1980s', label: '1980s', start: 1980, end: 1989 },
    { id: '1990s', label: '1990s', start: 1990, end: 1999 },
    { id: '2000s', label: '2000s', start: 2000, end: 2009 },
    { id: '2010s', label: '2010s', start: 2010, end: 2019 },
    { id: '2020s', label: '2020s', start: 2020, end: 2029 }
  ],
  contentData: {} // Will be populated with actual content later
};

// DOM elements cache
const Elements = {
  introContainer: null,
  mainContent: null,
  startBtn: null,
  decadeSelector: null,
  prevBtn: null,
  nextBtn: null,
  eraTitle: null,
  eraDescription: null,
  contentImage: null,
  contentVideo: null,
  introVideo: null
};

/**
 * Initialize the application
 */
function init() {
  // Cache DOM elements
  cacheElements();
  
  // Setup event listeners
  setupEventListeners();
  
  // Initialize decade selector
  initDecadeSelector();
  
  // Setup service worker controller change handler
  setupServiceWorkerHandlers();
  
  // Disable text selection and context menu for kiosk mode
  disableKioskInteractions();
  
  // Handle ESC key for admin exit (only works with physical keyboard)
  setupEscHandler();
  
  console.log('Totem application initialized');
}

/**
 * Cache frequently used DOM elements
 */
function cacheElements() {
  Elements.introContainer = document.getElementById('intro-video-container');
  Elements.mainContent = document.getElementById('main-content');
  Elements.startBtn = document.getElementById('start-btn');
  Elements.decadeSelector = document.getElementById('decade-selector');
  Elements.prevBtn = document.getElementById('prev-btn');
  Elements.nextBtn = document.getElementById('next-btn');
  Elements.eraTitle = document.getElementById('era-title');
  Elements.eraDescription = document.getElementById('era-description');
  Elements.contentImage = document.getElementById('content-image');
  Elements.contentVideo = document.getElementById('content-video');
  Elements.introVideo = document.getElementById('intro-video');
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Start button - transitions from intro to main content
  if (Elements.startBtn) {
    Elements.startBtn.addEventListener('click', handleStart);
    Elements.startBtn.addEventListener('touchstart', handleStart);
  }
  
  // Navigation buttons
  if (Elements.prevBtn) {
    Elements.prevBtn.addEventListener('click', handlePrevious);
    Elements.prevBtn.addEventListener('touchstart', handlePrevious);
  }
  
  if (Elements.nextBtn) {
    Elements.nextBtn.addEventListener('click', handleNext);
    Elements.nextBtn.addEventListener('touchstart', handleNext);
  }
  
  // Video error handling (fallback if video fails to load)
  if (Elements.introVideo) {
    Elements.introVideo.addEventListener('error', handleVideoError);
  }
  
  if (Elements.contentVideo) {
    Elements.contentVideo.addEventListener('error', handleVideoError);
  }
}

/**
 * Initialize decade selector buttons
 */
function initDecadeSelector() {
  if (!Elements.decadeSelector) return;
  
  Elements.decadeSelector.innerHTML = '';
  
  AppState.decades.forEach(decade => {
    const button = document.createElement('button');
    button.className = 'decade-button';
    button.textContent = decade.label;
    button.setAttribute('data-decade', decade.id);
    button.setAttribute('aria-label', `View ${decade.label}`);
    
    button.addEventListener('click', () => selectDecade(decade.id));
    button.addEventListener('touchstart', () => selectDecade(decade.id));
    
    Elements.decadeSelector.appendChild(button);
  });
}

/**
 * Handle start button - transition from intro to main content
 */
function handleStart(e) {
  e.preventDefault();
  e.stopPropagation();
  
  // Hide intro, show main content
  if (Elements.introContainer) {
    Elements.introContainer.classList.add('hidden');
  }
  if (Elements.mainContent) {
    Elements.mainContent.classList.remove('hidden');
  }
  
  // Stop intro video
  if (Elements.introVideo) {
    Elements.introVideo.pause();
  }
  
  // Select first decade by default
  if (AppState.decades.length > 0) {
    selectDecade(AppState.decades[0].id);
  }
}

/**
 * Select a decade and display its content
 * @param {string} decadeId - The ID of the decade to display
 */
function selectDecade(decadeId) {
  const decade = AppState.decades.find(d => d.id === decadeId);
  if (!decade) return;
  
  AppState.currentDecade = decade;
  
  // Update UI
  updateDecadeButtons();
  updateContent();
  updateNavigationButtons();
}

/**
 * Update decade button states (active/inactive)
 */
function updateDecadeButtons() {
  const buttons = Elements.decadeSelector.querySelectorAll('.decade-button');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-decade') === AppState.currentDecade?.id) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

/**
 * Update content display based on current decade
 */
function updateContent() {
  if (!AppState.currentDecade) return;
  
  const decadeId = AppState.currentDecade.id;
  const data = AppState.contentData[decadeId] || getDefaultContent(decadeId);
  
  // Update title and description
  if (Elements.eraTitle) {
    Elements.eraTitle.textContent = data.title || `${AppState.currentDecade.label} - Canadian Sports`;
  }
  
  if (Elements.eraDescription) {
    Elements.eraDescription.textContent = data.description || 
      `Explore Canadian sports history during the ${AppState.currentDecade.label}. Content will be added here.`;
  }
  
  // Update media (image or video)
  if (data.mediaType === 'video' && Elements.contentVideo) {
    Elements.contentImage.classList.add('hidden');
    Elements.contentVideo.classList.remove('hidden');
    Elements.contentVideo.play().catch(err => console.warn('Video play failed:', err));
  } else if (Elements.contentImage) {
    Elements.contentVideo.classList.add('hidden');
    Elements.contentImage.classList.remove('hidden');
  }
}

/**
 * Get default content for a decade (placeholder until real data is injected)
 * @param {string} decadeId - The decade ID
 * @returns {Object} Default content object
 */
function getDefaultContent(decadeId) {
  return {
    title: `${AppState.decades.find(d => d.id === decadeId)?.label} - Canadian Sports`,
    description: `Canadian sports during the ${AppState.decades.find(d => d.id === decadeId)?.label}. Historical content will be displayed here.`,
    mediaType: 'image' // Default to image, can be changed per decade
  };
}

/**
 * Handle previous decade navigation
 */
function handlePrevious(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!AppState.currentDecade) return;
  
  const currentIndex = AppState.decades.findIndex(d => d.id === AppState.currentDecade.id);
  if (currentIndex > 0) {
    selectDecade(AppState.decades[currentIndex - 1].id);
  }
}

/**
 * Handle next decade navigation
 */
function handleNext(e) {
  e.preventDefault();
  e.stopPropagation();
  
  if (!AppState.currentDecade) return;
  
  const currentIndex = AppState.decades.findIndex(d => d.id === AppState.currentDecade.id);
  if (currentIndex < AppState.decades.length - 1) {
    selectDecade(AppState.decades[currentIndex + 1].id);
  }
}

/**
 * Update navigation button states (disable at boundaries)
 */
function updateNavigationButtons() {
  if (!AppState.currentDecade) return;
  
  const currentIndex = AppState.decades.findIndex(d => d.id === AppState.currentDecade.id);
  
  if (Elements.prevBtn) {
    Elements.prevBtn.disabled = currentIndex === 0;
    Elements.prevBtn.classList.toggle('disabled', currentIndex === 0);
  }
  
  if (Elements.nextBtn) {
    Elements.nextBtn.disabled = currentIndex === AppState.decades.length - 1;
    Elements.nextBtn.classList.toggle('disabled', currentIndex === AppState.decades.length - 1);
  }
}

/**
 * Setup service worker controller change handler
 * Automatically refreshes the page when a new service worker takes control (after update)
 */
function setupServiceWorkerHandlers() {
  if ('serviceWorker' in navigator) {
    let refreshing = false;
    
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      
      // Reload the page to get the updated assets
      console.log('Service worker updated, refreshing page...');
      window.location.reload();
    });
  }
}

/**
 * Disable interactions that are not suitable for kiosk mode
 */
function disableKioskInteractions() {
  // Disable text selection
  document.addEventListener('selectstart', e => e.preventDefault());
  document.addEventListener('dragstart', e => e.preventDefault());
  
  // Disable context menu
  document.addEventListener('contextmenu', e => e.preventDefault());
  
  // Disable pinch zoom and double-tap zoom
  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  }, { passive: false });
  
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - (disableKioskInteractions.lastTouchEnd || 0) < 300) {
      e.preventDefault();
    }
    disableKioskInteractions.lastTouchEnd = now;
  }, { passive: false });
}

/**
 * Setup ESC key handler for admin exit
 * Note: This only works with a physical keyboard, not accessible to regular users
 */
function setupEscHandler() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' || e.keyCode === 27) {
      // Exit fullscreen if in fullscreen mode
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
      // Could also close the window if needed (uncomment if required)
      // window.close();
    }
  });
}

/**
 * Handle video loading errors
 */
function handleVideoError(e) {
  console.warn('Video failed to load, falling back to image');
  const video = e.target;
  if (video.id === 'content-video' && Elements.contentImage) {
    video.classList.add('hidden');
    Elements.contentImage.classList.remove('hidden');
  }
}

/**
 * Public API for injecting content data (to be used when content is ready)
 * @param {Object} data - Content data object keyed by decade ID
 */
function injectContentData(data) {
  AppState.contentData = { ...AppState.contentData, ...data };
  
  // Refresh current display if a decade is selected
  if (AppState.currentDecade) {
    updateContent();
  }
}

/**
 * Public API for programmatic navigation
 * @param {string} decadeId - The decade ID to navigate to
 */
function navigateToDecade(decadeId) {
  selectDecade(decadeId);
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export public API (for future use)
window.TotemApp = {
  injectContentData,
  navigateToDecade,
  getCurrentDecade: () => AppState.currentDecade,
  getDecades: () => AppState.decades
};

