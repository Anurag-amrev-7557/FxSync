import React, { useRef, useEffect, useState } from 'react'

function BottomTabBar({ mobileTab, setMobileTab, handleExitRoom }) {
  const tabRefs = [useRef(null), useRef(null), useRef(null)]
  const containerRef = useRef(null)
  const [bgStyle, setBgStyle] = useState({ left: 0, width: 0, opacity: 1 })
  const [bgActive, setBgActive] = useState(false)

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
    }
  }, [mobileTab])

  return (
    <nav
      ref={containerRef}
      className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-[90vw] max-w-sm bg-neutral-900 backdrop-blur-md border border-neutral-800/70 flex relative z-50 shadow-2xl rounded-full px-1 p-1 gap-1"
      style={{ boxShadow: '0 8px 32px 0 rgba(0,0,0,0.35)', position: 'fixed' }}
    >
      {/* Moving white background with enhanced animation */}
      <div
        className={`absolute top-1 left-0 h-[calc(100%-0.5rem)] rounded-full z-10 ${bgActive ? 'shadow-xl scale-105' : ''}`}
        style={{
          background: 'rgba(255,255,255,1)',
          left: bgStyle.left,
          width: bgStyle.width,
          height: 'calc(100% - 0.5rem)',
          boxShadow: bgActive
            ? '0 4px 32px 0 rgba(0,0,0,0.18), 0 0 0 4px rgba(59,130,246,0.10)'
            : '0 2px 16px 0 rgba(0,0,0,0.10)',
          opacity: 1,
          transition:
            'left 250ms cubic-bezier(0.22, 1, 0.36, 1), width 250ms cubic-bezier(0.22, 1, 0.36, 1), opacity 400ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 350ms cubic-bezier(0.22, 1, 0.36, 1), transform 350ms cubic-bezier(0.22, 1, 0.36, 1)',
          willChange: 'left, width, opacity, box-shadow, transform',
          transform: bgActive ? 'scale(1.05) translateY(0)' : 'scale(1) translateY(0)',
          mixBlendMode: 'normal',
        }}
      />
      <button
        ref={tabRefs[0]}
        className={`flex-1 flex flex-row items-center justify-center py-2 px-3 relative z-20 transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 active:bg-neutral-800/40 active:shadow-inner focus:outline-none focus:ring-0 hover:bg-neutral-800/20 rounded-full gap-2 ${mobileTab === 0 ? 'scale-105 shadow-lg' : ''} ${mobileTab === 0 ? 'text-black' : 'text-white hover:text-neutral-200'}`}
        style={{ zIndex: 10, transition: 'transform 400ms cubic-bezier(0.22,1,0.36,1), box-shadow 400ms cubic-bezier(0.22,1,0.36,1)' }}
        onClick={() => setMobileTab(0)}
      >
        {mobileTab === 0 && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-10 h-0.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50"></div>
        )}
        <div className={`w-5 h-5 flex items-center justify-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={mobileTab === 0 ? 'stroke-black' : 'stroke-white'}>
            <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" className={mobileTab === 0 ? 'stroke-black' : 'stroke-white'}></path>
            <circle cx="9" cy="7" r="4" className={mobileTab === 0 ? 'fill-black/10 stroke-black' : 'fill-transparent stroke-white'}></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" className={mobileTab === 0 ? 'stroke-black' : 'stroke-white'}></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75" className={mobileTab === 0 ? 'stroke-black' : 'stroke-white'}></path>
          </svg>
        </div>
        <span className={`text-sm font-medium ${mobileTab === 0 ? 'text-black' : 'text-white'}`}>Users</span>
        {mobileTab === 0 && (
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse pointer-events-none"></div>
        )}
      </button>
      <button
        ref={tabRefs[1]}
        className={`flex-1 flex flex-row items-center justify-center py-2 px-3 relative z-20 transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 active:bg-neutral-800/40 active:shadow-inner focus:outline-none focus:ring-0 hover:bg-neutral-800/20 rounded-full gap-2 ${mobileTab === 1 ? 'scale-105 shadow-lg' : ''} ${mobileTab === 1 ? 'text-black' : 'text-white hover:text-neutral-200'}`}
        style={{ zIndex: 10, transition: 'transform 400ms cubic-bezier(0.22,1,0.36,1), box-shadow 400ms cubic-bezier(0.22,1,0.36,1)' }}
        onClick={() => setMobileTab(1)}
      >
        {mobileTab === 1 && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-10 h-0.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50"></div>
        )}
        <div className={`w-5 h-5 flex items-center justify-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}>
            <line x1="8" y1="6" x2="21" y2="6" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}></line>
            <line x1="8" y1="12" x2="21" y2="12" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}></line>
            <line x1="8" y1="18" x2="21" y2="18" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}></line>
            <line x1="3" y1="6" x2="3.01" y2="6" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}></line>
            <line x1="3" y1="12" x2="3.01" y2="12" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}></line>
            <line x1="3" y1="18" x2="3.01" y2="18" className={mobileTab === 1 ? 'stroke-black' : 'stroke-white'}></line>
          </svg>
        </div>
        <span className={`text-sm font-medium ${mobileTab === 1 ? 'text-black' : 'text-white'}`}>Playlist</span>
        {mobileTab === 1 && (
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse pointer-events-none"></div>
        )}
      </button>
      <button
        ref={tabRefs[2]}
        className={`flex-1 flex flex-row items-center justify-center py-2 px-3 relative z-20 transition-all duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 active:bg-neutral-800/40 active:shadow-inner focus:outline-none focus:ring-0 hover:bg-neutral-800/20 rounded-full gap-2 ${mobileTab === 2 ? 'scale-105 shadow-lg' : ''} ${mobileTab === 2 ? 'text-black' : 'text-white hover:text-neutral-200'}`}
        style={{ zIndex: 10, transition: 'transform 400ms cubic-bezier(0.22,1,0.36,1), box-shadow 400ms cubic-bezier(0.22,1,0.36,1)' }}
        onClick={() => setMobileTab(2)}
      >
        {mobileTab === 2 && (
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-10 h-0.5 bg-primary rounded-full animate-pulse shadow-lg shadow-primary/50"></div>
        )}
        <div className={`w-5 h-5 flex items-center justify-center`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={mobileTab === 2 ? 'stroke-black' : 'stroke-white'}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" className={mobileTab === 2 ? 'stroke-black' : 'stroke-white'}></path>
          </svg>
        </div>
        <span className={`text-sm font-medium ${mobileTab === 2 ? 'text-black' : 'text-white'}`}>Chat</span>
        {mobileTab === 2 && (
          <div className="absolute inset-0 bg-primary/10 rounded-full animate-pulse pointer-events-none"></div>
        )}
      </button>
      {/* Exit button for mobile, optional: you can move this to a separate tab if desired */}
      <button
        onClick={handleExitRoom}
        className="hidden"
        title="Exit room"
      >
        Exit
      </button>
    </nav>
  )
}

export default BottomTabBar