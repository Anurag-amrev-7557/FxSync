import React from 'react';

const SessionHero = React.memo(function SessionHero({ isVisible }) {
  return (
    <div
      className="text-center lg:text-left space-y-8 sm:space-y-10 order-1 lg:order-1 mb-8 sm:mb-0 relative"
    >
      {/* Animated floating background shapes */}
      <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 opacity-40 blur-2xl z-0 animate-float-slow">
        <svg viewBox="0 0 200 200" fill="none">
          <ellipse cx="100" cy="100" rx="90" ry="60" fill="#60a5fa" fillOpacity="0.25" />
        </svg>
      </div>
      <div className="pointer-events-none absolute -bottom-12 -right-12 w-32 h-32 opacity-30 blur-2xl z-0 animate-float-slower">
        <svg viewBox="0 0 200 200" fill="none">
          <ellipse cx="100" cy="100" rx="80" ry="50" fill="#f472b6" fillOpacity="0.18" />
        </svg>
      </div>
      <div className="space-y-4 sm:space-y-6 relative z-10">
        <h1
          className={`text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-extrabold leading-tight text-white transition-all duration-1000 delay-300 drop-shadow-lg ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <span className="inline-block transition-all duration-700 delay-500 hover:scale-110 hover:text-blue-200 cursor-pointer group relative overflow-visible">
            <span className="relative z-10 bg-gradient-to-r from-white via-blue-100 to-neutral-200 bg-clip-text text-transparent group-hover:from-blue-200 group-hover:to-white transition-all duration-500">
              Sync Your
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/20 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
            {/* Animated music note */}
            <svg
              className="absolute -top-4 -right-8 w-8 h-8 text-blue-300 opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:animate-bounce"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            {/* Sparkle effect */}
            <svg
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-yellow-200 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-twinkle"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <polygon points="10,2 12,8 18,8 13,12 15,18 10,14 5,18 7,12 2,8 8,8" />
            </svg>
          </span>
          <br />
          <span className="text-neutral-300 inline-block transition-all duration-700 delay-700 hover:scale-110 hover:text-pink-200 cursor-pointer group relative overflow-visible">
            <span className="relative z-10 bg-gradient-to-r from-neutral-300 via-pink-200 to-white bg-clip-text text-transparent group-hover:from-white group-hover:to-pink-200 transition-all duration-500">
              Music
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-pink-400/30 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-400/20 via-neutral-500/30 to-blue-400/20 rounded-lg blur opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            {/* Animated sound waves */}
            <div className="absolute -bottom-2 left-0 flex items-end gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-500">
              {[1, 2, 3, 2, 1].map((height, i) => (
                <div
                  key={i}
                  className={`w-0.5 bg-gradient-to-t from-pink-300 to-white rounded-full animate-pulse`}
                  style={{
                    height: `${height * 6}px`,
                    animationDelay: `${i * 120}ms`,
                    animationDuration: '1.2s',
                  }}
                ></div>
              ))}
            </div>
            {/* Floating musical notes */}
            <svg
              className="absolute -top-4 -left-4 w-5 h-5 text-pink-300 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            <svg
              className="absolute -bottom-3 -right-3 w-4 h-4 text-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-700 delay-200 group-hover:animate-ping"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </span>
        </h1>
        <p
          className={`text-base sm:text-lg lg:text-xl text-neutral-300 max-w-lg mx-auto lg:mx-0 leading-relaxed transition-all duration-1000 delay-900 drop-shadow ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          Create <span className="font-semibold text-white">synchronized listening rooms</span> where everyone experiences music together.
          <span className="inline-block ml-2 transition-all duration-300 hover:rotate-12 animate-wiggle">🎧</span>
        </p>
      </div>
      {/* Enhanced Feature highlights with white SVGs and subtle hover pop */}
      <div
        className={`flex flex-wrap gap-4 sm:gap-6 max-w-md mx-auto lg:mx-0 justify-center lg:justify-start transition-all duration-1000 delay-1100 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {[
          {
            text: 'Real-time sync',
            icon: (
              <svg className="w-5 h-5 text-white group-hover:text-blue-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 12a9 9 0 1 1-3.5-7" />
                <polyline points="21 3 21 8 16 8" />
              </svg>
            ),
            delay: 0,
            tooltip: "Everyone hears the same thing at the same time",
            accent: "from-blue-400/30 to-blue-200/10"
          },
          {
            text: 'Group chat',
            icon: (
              <svg className="w-5 h-5 text-white group-hover:text-green-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
              </svg>
            ),
            delay: 100,
            tooltip: "Chat live with everyone in the room",
            accent: "from-green-400/30 to-green-200/10"
          },
          {
            text: 'Playlist sharing',
            icon: (
              <svg className="w-5 h-5 text-white group-hover:text-pink-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6v6H9z" />
              </svg>
            ),
            delay: 200,
            tooltip: "Collaborate on the perfect queue",
            accent: "from-pink-400/30 to-pink-200/10"
          },
          {
            text: 'No account needed',
            icon: (
              <svg className="w-5 h-5 text-white group-hover:text-yellow-200 transition-colors duration-300 drop-shadow" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            ),
            delay: 300,
            tooltip: "Jump in instantly, no sign up",
            accent: "from-yellow-400/30 to-yellow-200/10"
          }
        ].map((feature, index) => (
          <div
            key={feature.text}
            className={`relative flex items-center gap-2 text-xs sm:text-sm text-neutral-400 group cursor-pointer transition-all duration-300 hover:text-white hover:scale-105`}
            style={{ transitionDelay: `${feature.delay}ms` }}
            tabIndex={0}
            aria-label={feature.text}
          >
            <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br ${feature.accent} transition-all duration-300 shadow-md`}>
              {feature.icon}
            </div>
            <span className="transition-all duration-300 group-hover:translate-x-1 font-semibold">{feature.text}</span>
            {/* Tooltip on hover/focus */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-20 opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none transition-opacity duration-300">
              <span className="px-2 py-1 rounded bg-neutral-900/90 text-xs text-neutral-200 shadow-lg border border-neutral-700 whitespace-nowrap">
                {feature.tooltip}
              </span>
            </div>
            {/* Accent sparkle */}
            <svg
              className="absolute -top-2 -right-2 w-3 h-3 text-white opacity-0 group-hover:opacity-80 transition-all duration-500 group-hover:animate-twinkle"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <polygon points="10,2 12,8 18,8 13,12 15,18 10,14 5,18 7,12 2,8 8,8" />
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
});

export default SessionHero; 