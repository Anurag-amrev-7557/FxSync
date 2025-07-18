// Drift analysis Web Worker
let driftBuffer = [];
let ema = 0;
let alpha = 0.18;
let bufferSize = 9;

function median(arr) {
  if (!arr.length) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

onmessage = function (e) {
  const { drift, reset, setAlpha, setBufferSize } = e.data;
  if (reset) {
    driftBuffer = [];
    ema = 0;
    return;
  }
  if (typeof setAlpha === 'number') alpha = setAlpha;
  if (typeof setBufferSize === 'number') bufferSize = setBufferSize;
  if (typeof drift === 'number') {
    ema = alpha * drift + (1 - alpha) * ema;
    driftBuffer.push(ema);
    if (driftBuffer.length > bufferSize) driftBuffer.shift();
    const med = median(driftBuffer);
    postMessage({ ema, median: med });
  }
};
