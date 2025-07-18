import { useState, useEffect } from 'react';
import { saveMobileTab, loadMobileTab } from '../utils/persistence';

export default function useMobileTab(initial = 0, sessionId = null) {
  // On mount, load from localStorage (global or session-specific)
  const [mobileTab, setMobileTab] = useState(() => {
    return loadMobileTab(sessionId);
  });

  // If sessionId changes, reload the tab (for session-specific persistence)
  useEffect(() => {
    setMobileTab(loadMobileTab(sessionId));
  }, [sessionId]);

  // Save mobile tab whenever it changes
  useEffect(() => {
    saveMobileTab(sessionId, mobileTab);
  }, [mobileTab, sessionId]);

  return [mobileTab, setMobileTab];
}
