import React from 'react';
import clsx from 'clsx';
import {
  FloatingEllipseBlue,
  FloatingEllipsePink,
  MusicIcon,
  SparkleIcon,
  RealTimeSyncIcon,
  GroupChatIcon,
  PlaylistSharingIcon,
  NoAccountIcon
} from './Icons';
import FeatureHighlight from './FeatureHighlight';
import PropTypes from 'prop-types';

// Animation and layout constants
const ANIMATION_DELAY_REALTIME = 0;
const ANIMATION_DELAY_CHAT = 100;
const ANIMATION_DELAY_PLAYLIST = 200;
const ANIMATION_DELAY_NO_ACCOUNT = 300;
const SOUND_WAVE_HEIGHTS = [1, 2, 3, 2, 1];
const SOUND_WAVE_UNIT = 6; // px per unit
const SOUND_WAVE_ANIMATION_DURATION = '1.2s';
const SOUND_WAVE_ANIMATION_DELAY_UNIT = 120; // ms per bar
const HERO_TITLE_ANIMATION_DURATION = 1000;
const HERO_TITLE_ANIMATION_DELAY = 300;
const HERO_SUBTITLE_ANIMATION_DELAY = 900;
const HERO_FEATURES_ANIMATION_DELAY = 1100;

const SessionHero = React.memo(function SessionHero({ isVisible }) {
  return (
    <div className="text-center lg:text-left space-y-8 sm:space-y-10 order-1 lg:order-1 mb-8 sm:mb-0 relative">
      {/* Animated floating background shapes */}
      <div className="pointer-events-none absolute -top-10 -left-10 w-40 h-40 opacity-40 blur-2xl z-0 animate-float-slow">
        <FloatingEllipseBlue />
      </div>
      <div className="pointer-events-none absolute -bottom-12 -right-12 w-32 h-32 opacity-30 blur-2xl z-0 animate-float-slower">
        <FloatingEllipsePink />
      </div>
      <div className="space-y-4 sm:space-y-6 relative z-10">
        <h1
          className={clsx(
            'text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-extrabold leading-tight text-white transition-all',
            `duration-${HERO_TITLE_ANIMATION_DURATION} delay-${HERO_TITLE_ANIMATION_DELAY} drop-shadow-lg`,
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}
        >
          <span className="inline-block transition-all duration-700 delay-500 hover:scale-110 hover:text-blue-200 cursor-pointer group relative overflow-visible">
            <span className="relative z-10 bg-gradient-to-r from-white via-blue-100 to-neutral-200 bg-clip-text text-transparent group-hover:from-blue-200 group-hover:to-white transition-all duration-500">
              Sync Your
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-400/20 to-transparent transform -skew-x-12 transition-transform duration-700 group-hover:translate-x-full"></div>
            {/* Animated music note */}
            <MusicIcon className="absolute -top-4 -right-8 w-8 h-8 text-blue-300 opacity-0 group-hover:opacity-100 transition-all duration-500 group-hover:animate-bounce" />
            {/* Sparkle effect */}
            <SparkleIcon className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 text-yellow-200 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-twinkle" />
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
              {SOUND_WAVE_HEIGHTS.map((height, i) => (
                <div
                  key={i}
                  className={clsx('w-0.5 bg-gradient-to-t from-pink-300 to-white rounded-full animate-pulse')}
                  style={{
                    height: `${height * SOUND_WAVE_UNIT}px`,
                    animationDelay: `${i * SOUND_WAVE_ANIMATION_DELAY_UNIT}ms`,
                    animationDuration: SOUND_WAVE_ANIMATION_DURATION,
                  }}
                ></div>
              ))}
            </div>
            {/* Floating musical notes */}
            <MusicIcon className="absolute -top-4 -left-4 w-5 h-5 text-pink-300 opacity-0 group-hover:opacity-100 transition-all duration-700 group-hover:animate-spin" />
            <MusicIcon className="absolute -bottom-3 -right-3 w-4 h-4 text-blue-400 opacity-0 group-hover:opacity-100 transition-all duration-700 delay-200 group-hover:animate-ping" />
          </span>
        </h1>
        <p
          className={clsx(
            'text-base sm:text-lg lg:text-xl text-neutral-300 max-w-lg mx-auto lg:mx-0 leading-relaxed transition-all',
            `duration-${HERO_TITLE_ANIMATION_DURATION} delay-${HERO_SUBTITLE_ANIMATION_DELAY} drop-shadow`,
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}
        >
          Create <span className="font-semibold text-white">synchronized listening rooms</span>{' '}
          where everyone experiences music together.
          <span className="inline-block ml-2 transition-all duration-300 hover:rotate-12 animate-wiggle">
            🎧
          </span>
        </p>
      </div>
      {/* Enhanced Feature highlights with white SVGs and subtle hover pop */}
      <div
        className={clsx(
          'flex flex-wrap gap-4 sm:gap-6 max-w-md mx-auto lg:mx-0 justify-center lg:justify-start transition-all',
          `duration-${HERO_TITLE_ANIMATION_DURATION} delay-${HERO_FEATURES_ANIMATION_DELAY}`,
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        )}
      >
        <FeatureHighlight
          icon={<RealTimeSyncIcon className="w-5 h-5 text-white group-hover:text-blue-200 transition-colors duration-300 drop-shadow" />}
          text="Real-time sync"
          tooltip="Everyone hears the same thing at the same time"
          accent="from-blue-400/30 to-blue-200/10"
          delay={ANIMATION_DELAY_REALTIME}
        />
        <FeatureHighlight
          icon={<GroupChatIcon className="w-5 h-5 text-white group-hover:text-green-200 transition-colors duration-300 drop-shadow" />}
          text="Group chat"
          tooltip="Chat live with everyone in the room"
          accent="from-green-400/30 to-green-200/10"
          delay={ANIMATION_DELAY_CHAT}
        />
        <FeatureHighlight
          icon={<PlaylistSharingIcon className="w-5 h-5 text-white group-hover:text-pink-200 transition-colors duration-300 drop-shadow" />}
          text="Playlist sharing"
          tooltip="Collaborate on the perfect queue"
          accent="from-pink-400/30 to-pink-200/10"
          delay={ANIMATION_DELAY_PLAYLIST}
        />
        <FeatureHighlight
          icon={<NoAccountIcon className="w-5 h-5 text-white group-hover:text-yellow-200 transition-colors duration-300 drop-shadow" />}
          text="No account needed"
          tooltip="Jump in instantly, no sign up"
          accent="from-yellow-400/30 to-yellow-200/10"
          delay={ANIMATION_DELAY_NO_ACCOUNT}
        />
      </div>
    </div>
  );
});

SessionHero.propTypes = {
  isVisible: PropTypes.bool.isRequired,
};

export default SessionHero;
