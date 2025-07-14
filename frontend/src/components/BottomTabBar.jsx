import React, { useRef, useEffect, useState } from 'react'

/**
 * BottomTabBar - Enhanced minimalist, modern, glassy tab bar for mobile
 * Props:
 *   mobileTab: number (active tab index)
 *   setMobileTab: function (to change tab)
 *   unreadCount?: number (unread chat messages)
 *   compact?: boolean (icon-only mode)
 *   disabledTabs?: number[] (indices of disabled tabs)
 */
function BottomTabBar({ mobileTab, setMobileTab, unreadCount = 0, compact = false, disabledTabs = [] }) {
  const tabRefs = [useRef(null), useRef(null), useRef(null)]
  const containerRef = useRef(null)
  const [bgStyle, setBgStyle] = useState({ left: 0, width: 0, opacity: 1 })
  const [bgActive, setBgActive] = useState(false)

  // Animate background highlight
  useEffect(() => {
    const activeRef = tabRefs[mobileTab]?.current
    const container = containerRef.current
    if (activeRef && container) {
      const tabRect = activeRef.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      setBgStyle({
        left: tabRect.left - containerRect.left,
        width: tabRect.width,
        opacity: 1
      })
      setBgActive(false)
      requestAnimationFrame(() => {
        setBgActive(true)
        setTimeout(() => setBgActive(false), 250)
      })
      // Haptic feedback for mobile only
      if (typeof window !== 'undefined' && 'ontouchstart' in window && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(10)
      }
    }
  }, [mobileTab])

  // Keyboard navigation for tabs
  const handleKeyDown = (e, idx) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      let next = (idx + 1) % tabRefs.length;
      while (disabledTabs.includes(next)) next = (next + 1) % tabRefs.length;
      tabRefs[next].current.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      let prev = (idx - 1 + tabRefs.length) % tabRefs.length;
      while (disabledTabs.includes(prev)) prev = (prev - 1 + tabRefs.length) % tabRefs.length;
      tabRefs[prev].current.focus();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabledTabs.includes(idx)) setMobileTab(idx);
    }
  };

  // Tab data (add more tabs here if needed)
  const tabData = [
    {
      label: 'Audio',
      tooltip: 'Audio controls',
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? 'stroke-black' : 'stroke-white'}>
          <path d="M9 18V5l12-2v13" className={active ? 'stroke-black' : 'stroke-white'}></path>
          <circle cx="6" cy="18" r="3" className={active ? 'fill-black/10 stroke-black' : 'fill-transparent stroke-white'}></circle>
          <circle cx="18" cy="16" r="3" className={active ? 'fill-black/10 stroke-black' : 'fill-transparent stroke-white'}></circle>
        </svg>
      )
    },
    {
      label: 'Playlist',
      tooltip: 'View playlist',
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? 'stroke-black' : 'stroke-white'}>
          <line x1="8" y1="6" x2="21" y2="6" className={active ? 'stroke-black' : 'stroke-white'}></line>
          <line x1="8" y1="12" x2="21" y2="12" className={active ? 'stroke-black' : 'stroke-white'}></line>
          <line x1="8" y1="18" x2="21" y2="18" className={active ? 'stroke-black' : 'stroke-white'}></line>
          <line x1="3" y1="6" x2="3.01" y2="6" className={active ? 'stroke-black' : 'stroke-white'}></line>
          <line x1="3" y1="12" x2="3.01" y2="12" className={active ? 'stroke-black' : 'stroke-white'}></line>
          <line x1="3" y1="18" x2="3.01" y2="18" className={active ? 'stroke-black' : 'stroke-white'}></line>
        </svg>
      )
    },
    {
      label: 'Chat',
      tooltip: 'Open chat',
      icon: (active) => (
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={active ? 'stroke-black' : 'stroke-white'}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" className={active ? 'stroke-black' : 'stroke-white'}></path>
        </svg>
      ),
      badge: unreadCount > 0 ? unreadCount : 0
    }
  ]

  return (
    <nav
      ref={containerRef}
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-[92vw] max-w-sm bg-black/80 backdrop-blur-lg flex relative z-50 shadow-2xl rounded-full px-2 py-1 gap-1 border border-neutral-900/70"
      style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.38)', position: 'fixed' }}
      aria-label="Main navigation"
      role="tablist"
    >
      {/* Animated glowing background for active tab */}
      <div
        className={`absolute top-1 left-0 h-[calc(100%-0.5rem)] rounded-full z-10 pointer-events-none ${bgActive ? 'shadow-xl scale-105' : ''}`}
        style={{
          background: 'linear-gradient(90deg, #fff 80%, #e0e7ff 100%)',
          left: bgStyle.left,
          width: bgStyle.width,
          height: 'calc(100% - 0.5rem)',
          boxShadow: bgActive
            ? '0 4px 32px 0 rgba(255,255,255,0.18), 0 0 0 4px rgba(255,255,255,0.10)'
            : '0 2px 16px 0 rgba(0,0,0,0.10)',
          opacity: 1,
          transition:
            'left 250ms cubic-bezier(0.22, 1, 0.36, 1), width 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 350ms cubic-bezier(0.22, 1, 0.36, 1), transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'left, width, opacity, box-shadow, transform',
          transform: bgActive ? 'scale(1.05) translateY(0)' : 'scale(1) translateY(0)',
          mixBlendMode: 'normal',
        }}
      />
      {tabData.map((tab, idx) => {
        const isActive = mobileTab === idx
        const isDisabled = disabledTabs.includes(idx)
        return (
          <button
            key={tab.label}
            ref={tabRefs[idx]}
            className={`flex-1 flex flex-row items-center justify-center py-2 px-3 relative z-20 transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 active:bg-neutral-800/40 active:shadow-inner focus:outline-none hover:bg-neutral-800/20 rounded-full gap-2 ${isActive ? 'scale-105 shadow-lg' : ''} ${isActive ? 'text-black font-bold' : 'text-white hover:text-neutral-200'} ${isDisabled ? 'opacity-40 pointer-events-none' : ''}`}
            style={{
              zIndex: 10,
              transition: 'transform 400ms cubic-bezier(0.22,1,0.36,1), box-shadow 400ms cubic-bezier(0.22,1,0.36,1)',
              outline: 'none',
              boxShadow: 'none',
            }}
            onClick={() => !isDisabled && setMobileTab(idx)}
            onKeyDown={e => handleKeyDown(e, idx)}
            role="tab"
            aria-selected={isActive}
            aria-controls={`tabpanel-${idx}`}
            tabIndex={isActive ? 0 : -1}
            title={tab.tooltip}
            aria-disabled={isDisabled}
          >
            {isActive && (
              <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-10 h-0.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50"></div>
            )}
            <div className="w-5 h-5 flex items-center justify-center relative">
              {tab.icon(isActive)}
              {/* Unread badge for chat */}
              {tab.badge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 shadow-lg border-2 border-white animate-bounce">
                  {tab.badge > 99 ? '99+' : tab.badge}
                </span>
              )}
            </div>
            {!compact && (
              <span className={`text-sm font-medium ${isActive ? 'text-black font-bold' : 'text-white'}`}>{tab.label}</span>
            )}
            {isActive && (
              <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse pointer-events-none"></div>
            )}
          </button>
        )
      })}
    </nav>
  )
}

export default BottomTabBar