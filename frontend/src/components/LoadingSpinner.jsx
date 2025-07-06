import React from 'react';

export default function LoadingSpinner({ 
  size = 'md', 
  text = 'Loading...', 
  className = '',
  showText = true 
}) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
    xl: 'h-16 w-16'
  };

  const textSizes = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
    xl: 'text-lg'
  };

  return (
    <div className={`flex flex-col items-center justify-center p-4 animate-fade-in ${className}`}>
      <div className={`animate-spin rounded-full border-b-2 border-primary ${sizeClasses[size]}`}></div>
      {showText && text && (
        <p className={`text-neutral-400 mt-3 ${textSizes[size]} animate-fade-in-slow`}>
          {text}
        </p>
      )}
    </div>
  );
}

// Variant for inline loading
export function InlineLoadingSpinner({ size = 'sm', className = '' }) {
  const sizeClasses = {
    sm: 'h-3 w-3',
    md: 'h-4 w-4',
    lg: 'h-5 w-5'
  };

  return (
    <div className={`animate-spin rounded-full border border-white/30 border-t-white ${sizeClasses[size]} ${className}`}></div>
  );
} 