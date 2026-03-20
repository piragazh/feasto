/**
 * ARIA Live Region Utilities - Screen Reader Announcements
 * Provides helpers for announcing dynamic status updates to accessibility tools
 */

// Singleton live regions for announcements
let liveRegions = {};

/**
 * Initialize ARIA live regions in the DOM
 * Call once on app mount
 */
export function initializeLiveRegions() {
  const regions = {
    polite: createLiveRegion('aria-live-polite', 'polite'),
    assertive: createLiveRegion('aria-live-assertive', 'assertive'),
    status: createLiveRegion('aria-live-status', 'status')
  };
  
  liveRegions = regions;
  return regions;
}

/**
 * Create an ARIA live region element
 */
function createLiveRegion(id, role = 'status') {
  let region = document.getElementById(id);
  
  if (!region) {
    region = document.createElement('div');
    region.id = id;
    region.setAttribute('aria-live', role === 'status' ? 'polite' : role);
    region.setAttribute('aria-atomic', 'true');
    region.setAttribute('role', role === 'status' ? 'status' : role);
    region.className = 'sr-only'; // Visually hidden but accessible
    region.style.cssText = `
      position: absolute;
      left: -9999px;
      width: 1px;
      height: 1px;
      overflow: hidden;
    `;
    document.body.appendChild(region);
  }
  
  return region;
}

/**
 * Announce a message to screen readers (polite)
 * Use for non-urgent announcements (form submission, data loaded, etc.)
 */
export function announcePolite(message) {
  if (!liveRegions.polite) {
    liveRegions.polite = createLiveRegion('aria-live-polite', 'polite');
  }
  liveRegions.polite.textContent = message;
}

/**
 * Announce a message to screen readers (assertive)
 * Use for urgent announcements (errors, warnings, critical updates)
 */
export function announceAssertive(message) {
  if (!liveRegions.assertive) {
    liveRegions.assertive = createLiveRegion('aria-live-assertive', 'assertive');
  }
  liveRegions.assertive.textContent = message;
}

/**
 * Announce a status message
 * Use for status updates (order confirmed, loading complete, etc.)
 */
export function announceStatus(message) {
  if (!liveRegions.status) {
    liveRegions.status = createLiveRegion('aria-live-status', 'status');
  }
  liveRegions.status.textContent = message;
}

/**
 * Create a live region component for React
 * Usage: <LiveRegion role="status" message={dynamicMessage} />
 */
export function LiveRegion({ role = 'status', message, ariaLabel, children }) {
  const roleMap = {
    status: { ariaLive: 'polite', role: 'status' },
    alert: { ariaLive: 'assertive', role: 'alert' },
    polite: { ariaLive: 'polite' },
    assertive: { ariaLive: 'assertive' }
  };

  const { ariaLive, role: ariaRole } = roleMap[role] || roleMap.status;

  return (
    <div
      aria-live={ariaLive}
      aria-atomic="true"
      role={ariaRole}
      aria-label={ariaLabel}
      className="sr-only"
      style={{
        position: 'absolute',
        left: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden'
      }}
    >
      {message || children}
    </div>
  );
}

/**
 * Hook to announce updates via live regions
 * Usage: const announce = useAnnouncement(); announce('Order placed!');
 */
export function useAnnouncement() {
  return {
    polite: announcePolite,
    assertive: announceAssertive,
    status: announceStatus
  };
}

/**
 * Mark a container as having dynamic updates
 * Applies aria-live and aria-atomic attributes
 */
export function createDynamicRegion(element, options = {}) {
  const {
    polite = true,
    atomic = true,
    relevant = 'additions text',
    label = ''
  } = options;

  element.setAttribute('aria-live', polite ? 'polite' : 'assertive');
  element.setAttribute('aria-atomic', atomic.toString());
  element.setAttribute('aria-relevant', relevant);
  
  if (label) {
    element.setAttribute('aria-label', label);
  }

  return element;
}

/**
 * Announce loading states
 */
export function announceLoading(resource = 'content') {
  announceStatus(`Loading ${resource}...`);
}

/**
 * Announce completion
 */
export function announceComplete(action = 'Operation') {
  announceStatus(`${action} completed`);
}

/**
 * Announce errors
 */
export function announceError(message) {
  announceAssertive(`Error: ${message}`);
}

/**
 * Announce number of items/results
 */
export function announceResultCount(count, itemLabel = 'item') {
  const plural = count === 1 ? itemLabel : `${itemLabel}s`;
  announceStatus(`${count} ${plural} found`);
}