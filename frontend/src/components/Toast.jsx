import React from 'react';

function Toast({ message, onClose, mobile = false }) {
  const [visible, setVisible] = React.useState(!!message);
  const [exiting, setExiting] = React.useState(false);
  const exitDuration = 340; // ms, should match animation

  React.useEffect(() => {
    if (!message) {
      setVisible(false);
      setExiting(false);
      return;
    }
    setVisible(true);
    setExiting(false);
    const duration = message.length > 40 ? 5000 : 3000;
    const timer = setTimeout(() => {
      setExiting(true);
    }, duration);
    return () => clearTimeout(timer);
  }, [message]);

  // When exit animation ends, call onClose
  React.useEffect(() => {
    if (exiting) {
      const timer = setTimeout(() => {
        setVisible(false);
        setExiting(false);
        if (onClose) onClose();
      }, exitDuration);
      return () => clearTimeout(timer);
    }
  }, [exiting, onClose]);

  // Close button triggers exit animation
  const handleClose = () => {
    setExiting(true);
  };

  if (!visible) return null;

  // Minimalist color palette
  const bgColor = mobile ? 'bg-neutral-900/90' : 'bg-neutral-900/95';
  const textColor = 'text-white';
  const borderColor = 'border border-neutral-800';
  const shadow = mobile ? 'shadow-xl' : 'shadow-lg';
  const rounded = mobile ? 'rounded-xl' : 'rounded-lg';
  const padding = mobile ? 'px-5 py-3' : 'px-4 py-2';
  const font = 'font-medium text-base';
  const closeBtn =
    'ml-2 flex items-center justify-center w-7 h-7 rounded-full hover:bg-neutral-800/70 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white';
  const iconStyle = 'w-4 h-4 text-neutral-400 group-hover:text-white transition';

  // Animation classes
  const animationClass = mobile
    ? exiting
      ? 'animate-toast-slide-down'
      : 'animate-toast-slide-up'
    : exiting
      ? 'animate-toast-fade-down'
      : 'animate-fade-in';

  return (
    <div
      className={
        mobile
          ? 'fixed left-0 right-0 bottom-[calc(80px+6.5rem)] w-full z-50 flex justify-center pointer-events-none'
          : 'fixed bottom-7 left-1/2 -translate-x-1/2 z-50'
      }
      role="alert"
      aria-live="assertive"
    >
      <div
        className={[
          'flex items-center gap-2 pointer-events-auto',
          bgColor,
          textColor,
          borderColor,
          shadow,
          rounded,
          padding,
          mobile ? 'w-[95vw] max-w-sm' : 'min-w-[220px] max-w-md',
          animationClass,
        ].join(' ')}
        style={{
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          boxShadow: mobile ? '0 6px 32px 0 rgba(0,0,0,0.22)' : '0 2px 16px 0 rgba(0,0,0,0.18)',
        }}
      >
        <span className={`flex-1 text-center ${font} truncate`}>{message}</span>
        <button
          onClick={handleClose}
          aria-label="Close notification"
          className={closeBtn + ' group'}
          tabIndex={0}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 18,
            lineHeight: 1,
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          <svg
            className={iconStyle}
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="5" y1="5" x2="15" y2="15" stroke="currentColor" strokeLinecap="round" />
            <line x1="15" y1="5" x2="5" y2="15" stroke="currentColor" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {/* Minimalist animation for mobile and desktop */}
      <style>{`
        @keyframes toast-slide-up {
          0% { transform: translateY(100%); opacity: 0; }
          70% { transform: translateY(-6px); opacity: 1; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes toast-slide-down {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(100%); opacity: 0; }
        }
        .animate-toast-slide-up {
          animation: toast-slide-up 0.32s cubic-bezier(0.22,1,0.36,1);
        }
        .animate-toast-slide-down {
          animation: toast-slide-down 0.34s cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes toast-fade-down {
          0% { opacity: 1; transform: translateY(0);}
          100% { opacity: 0; transform: translateY(40px);}
        }
        .animate-toast-fade-down {
          animation: toast-fade-down 0.34s cubic-bezier(0.22,1,0.36,1);
        }
      `}</style>
    </div>
  );
}

export default Toast;
