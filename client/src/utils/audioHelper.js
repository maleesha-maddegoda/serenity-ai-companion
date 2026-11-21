// audioHelper.js
// Utility functions for PCM audio conversion, base64 encoding/decoding, and Web Audio playback

/**
 * Converts Uint8Array bytes to Base64 string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function encode(bytes) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Converts Base64 string back to Uint8Array
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function decode(base64) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Converts raw 16-bit Linear PCM bytes into Web Audio API AudioBuffer for playback
 * @param {Uint8Array} data
 * @param {AudioContext} ctx
 * @param {number} sampleRate
 * @param {number} numChannels
 * @returns {Promise<AudioBuffer>}
 */
export async function decodeAudioData(
  data,
  ctx,
  sampleRate = 24000,
  numChannels = 1
) {
  const alignedBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  );
  const dataInt16 = new Int16Array(alignedBuffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Converts Float32Array channel data from microphone to 16-bit PCM Uint8Array
 * @param {Float32Array} float32Array
 * @returns {Uint8Array}
 */
export function floatTo16BitPCM(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(int16.buffer);
}

/**
 * Calculate RMS volume level from Float32Array (0 - 100)
 * @param {Float32Array} buffer
 * @returns {number}
 */
export function calculateRMS(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sum / buffer.length);
  return Math.min(100, Math.round(rms * 100));
}
