import { useState } from 'react';

export default function useMobileTab(initial = 0) {
  const [mobileTab, setMobileTab] = useState(initial);
  return [mobileTab, setMobileTab];
} 