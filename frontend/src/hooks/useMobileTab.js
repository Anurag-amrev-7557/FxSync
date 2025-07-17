import { useState, useEffect } from 'react';
import { saveMobileTab, loadMobileTab } from '../utils/persistence';

export default function useMobileTab(initial = 0, sessionId = null) {
  const [mobileTab, setMobileTab] = useState(initial);

  // Load saved mobile tab when sessionId changes
  useEffect(() => {
    if (sessionId) {
      const savedTab = loadMobileTab(sessionId);
      setMobileTab(savedTab);
    }
  }, [sessionId]);

  // Save mobile tab whenever it changes
  useEffect(() => {
    if (sessionId) {
      saveMobileTab(sessionId, mobileTab);
    }
  }, [mobileTab, sessionId]);

  return [mobileTab, setMobileTab];
} 