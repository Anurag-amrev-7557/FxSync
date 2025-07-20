import { useState, useEffect } from 'react';

// Utility: Detect device type based on user agent, screen size, and pointer type
function getDeviceType() {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true, width: 1024, isTouchDevice: false };
  }
  const width = window.innerWidth;
  const ua = navigator.userAgent;
  // User agent check for mobile/tablet
  const isMobileUA = /Mobi|Android|iPhone|iPod|Opera Mini|IEMobile|BlackBerry|webOS|Windows Phone|Mobile/i.test(ua);
  const isTabletUA = /Tablet|iPad/i.test(ua);
  // Pointer type check for touch devices
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  // Screen width breakpoints (can be adjusted)
  const isMobile = isMobileUA || width < 640 || isTouchDevice;
  const isTablet = (!isMobileUA && isTabletUA) || (width >= 640 && width < 1024);
  const isDesktop = !isMobile && !isTablet;
  return { isMobile, isTablet, isDesktop, width, isTouchDevice };
}

export default function useDeviceType() {
  const [device, setDevice] = useState(getDeviceType());

  useEffect(() => {
    function handleResize() {
      setDevice(getDeviceType());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return device;
} 