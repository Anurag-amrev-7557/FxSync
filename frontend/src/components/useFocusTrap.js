import { useEffect } from 'react';

export default function useFocusTrap(isOpen, ref, closeFn) {
  useEffect(() => {
    if (!isOpen || !ref.current) return;
    const focusable = ref.current.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) focusable[0].focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeFn();
      }
      if (e.key === 'Tab') {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    ref.current.addEventListener('keydown', handleKeyDown);
    return () => ref.current && ref.current.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, ref, closeFn]);
} 