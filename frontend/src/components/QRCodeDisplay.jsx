import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export default function QRCodeDisplay({ value, size = 128, label = '', showCopy = true }) {

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative group transition-transform duration-300 hover:scale-105"
        style={{ width: size, height: size }}
      >
        <QRCodeSVG
          value={value || ''}
          size={size}
          bgColor="#18181b"
          fgColor="#fff"
          style={{
            borderRadius: 12,
            border: '1px solid #52525b',
            boxShadow: '0 2px 8px #0002',
            width: size,
            height: size,
            transition: 'box-shadow 0.3s',
          }}
        />
      </div>
      {label && (
        <div className="text-xs text-neutral-400 mt-1 text-center select-all break-all max-w-xs">
          {label}
        </div>
      )}
      {value && (
        <div className="text-[10px] text-neutral-500 mt-1 text-center select-all break-all max-w-xs">
          {value}
        </div>
      )}
    </div>
  );
}