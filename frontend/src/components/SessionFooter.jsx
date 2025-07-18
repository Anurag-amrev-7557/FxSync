import React from 'react';

const SessionFooter = React.memo(function SessionFooter({ isVisible }) {
  return (
    <footer
      className={`relative p-4 sm:p-6 lg:p-8 text-center transition-all duration-1000 delay-1300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
    >
      <div className="flex flex-col items-center gap-2">
        <p className="text-neutral-400 text-xs sm:text-sm transition-all duration-300 hover:text-neutral-200 font-medium flex items-center justify-center gap-2">
          <span>
            <svg
              className="inline-block mr-1 mb-0.5"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
            Experience music together with{' '}
            <span className="font-bold text-white hover:text-blue-300 transition-colors">
              FxSync
            </span>
          </span>
        </p>
        <div className="flex items-center justify-center gap-4 mt-1">
          <a
            href="https://github.com/Anurag-amrev-7557"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 hover:text-white transition-colors"
            aria-label="GitHub"
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.09.66-.22.66-.48 0-.24-.01-.87-.01-1.7-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.1-1.46-1.1-1.46-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.56-1.11-4.56-4.95 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.8c.85.004 1.71.12 2.51.35 1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.85-2.34 4.7-4.57 4.95.36.31.68.92.68 1.85 0 1.33-.01 2.4-.01 2.73 0 .27.16.58.67.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
            </svg>
          </a>
          <a
            href="https://www.linkedin.com/in/anurag-verma-18645b280/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-500 hover:text-white transition-colors"
            aria-label="LinkedIn"
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <path d="M16 8a6 6 0 0 1 6 6v5h-4v-5a2 2 0 0 0-4 0v5h-4v-5a6 6 0 0 1 6-6z" />
              <rect width="4" height="12" x="2" y="9" rx="2" />
              <circle cx="4" cy="4" r="2" />
            </svg>
          </a>
          <a
            href="mailto:anuragverma08002@gmail.com"
            className="text-neutral-500 hover:text-white transition-colors"
            aria-label="Email"
          >
            <svg
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 6-8.97 6.48a2 2 0 0 1-2.06 0L2 6" />
            </svg>
          </a>
        </div>
        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] text-neutral-600 dark:text-neutral-500">
          <span>
            Made by{' '}
            <a
              href="https://github.com/Anurag-amrev-7557"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-blue-300"
            >
              Anurag Verma
            </a>
          </span>
          <span className="mx-1">·</span>
          <span>
            <a
              href="https://github.com/Anurag-amrev-7557/fxsync"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline hover:text-blue-300"
            >
              Source
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
});

export default SessionFooter;
