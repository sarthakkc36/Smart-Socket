// PWA Installability Check Script
document.addEventListener('DOMContentLoaded', () => {
  const checkList = document.createElement('div');
  checkList.id = 'pwa-check';
  checkList.style.cssText = 'position: fixed; bottom: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; border-radius: 5px; font-size: 12px; max-width: 300px; z-index: 9999; display: none;';
  
  // Add a toggle button
  const toggleButton = document.createElement('button');
  toggleButton.textContent = 'PWA Check';
  toggleButton.style.cssText = 'position: fixed; bottom: 10px; right: 10px; background: #4285f4; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; z-index: 10000;';
  toggleButton.onclick = () => {
    if (checkList.style.display === 'none') {
      checkList.style.display = 'block';
      runChecks();
    } else {
      checkList.style.display = 'none';
    }
  };
  
  document.body.appendChild(toggleButton);
  document.body.appendChild(checkList);
  
  function addCheckResult(name, passed, details = '') {
    const item = document.createElement('div');
    item.style.margin = '5px 0';
    item.innerHTML = `
      <span style="color: ${passed ? '#34a853' : '#ea4335'}">
        ${passed ? '✓' : '✗'}
      </span>
      <strong>${name}:</strong> ${passed ? 'Passed' : 'Failed'}
      ${details ? `<div style="margin-left: 20px; font-size: 11px; color: #ccc;">${details}</div>` : ''}
    `;
    checkList.appendChild(item);
  }
  
  function runChecks() {
    // Clear previous results
    checkList.innerHTML = '<h3 style="margin-top: 0;">PWA Installability Checks</h3>';
    
    // Check if running in secure context (HTTPS)
    const isSecureContext = window.isSecureContext;
    addCheckResult('Secure Context', isSecureContext, 
      isSecureContext ? 'Running on HTTPS or localhost' : 'PWAs require HTTPS');
    
    // Check for service worker support
    const swSupported = 'serviceWorker' in navigator;
    addCheckResult('Service Worker Support', swSupported,
      swSupported ? 'Browser supports Service Workers' : 'Service Workers not supported');
    
    // Check if service worker is registered
    if (swSupported) {
      navigator.serviceWorker.getRegistration().then(registration => {
        addCheckResult('Service Worker Registered', !!registration,
          registration ? `Scope: ${registration.scope}` : 'No service worker registered');
      });
    }
    
    // Check for manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    addCheckResult('Manifest Link', !!manifestLink,
      manifestLink ? `Href: ${manifestLink.href}` : 'No manifest link found');
    
    // Check for installability
    if ('BeforeInstallPromptEvent' in window) {
      addCheckResult('Install API', true, 'BeforeInstallPromptEvent is available');
    } else {
      addCheckResult('Install API', false, 'BeforeInstallPromptEvent not available');
    }
    
    // Check for display-mode
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                         window.navigator.standalone || 
                         document.referrer.includes('android-app://');
    addCheckResult('Already Installed', isStandalone,
      isStandalone ? 'Running as installed app' : 'Running in browser');
    
    // Add browser info
    addCheckResult('Browser', true, `${navigator.userAgent}`);
  }
});
