// Generates assets/sounds/ride_alert.wav — "Sppero Alert" ringtone
// Pattern: di-di-DUN!  (880→880→1100→1320 Hz ascending)
const fs   = require('fs');
const path = require('path');

const SR  = 22050; // sample rate Hz
const tones = [
  { f: 880,  d: 0.10 },
  { f: 0,    d: 0.045 },
  { f: 880,  d: 0.10 },
  { f: 0,    d: 0.045 },
  { f: 1100, d: 0.08 },
  { f: 1320, d: 0.32 },
  { f: 0,    d: 0.06 },
];

const totalSamples = tones.reduce((s, t) => s + Math.floor(SR * t.d), 0);
const dataSize     = totalSamples * 2;
const buf          = Buffer.alloc(44 + dataSize);

// WAV header (PCM, 16-bit, mono)
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);

let pos = 44;
for (const tone of tones) {
  const n = Math.floor(SR * tone.d);
  for (let i = 0; i < n; i++) {
    let v = 0;
    if (tone.f > 0) {
      const t       = i / SR;
      const attack  = 0.006;
      const release = 0.035;
      const env     = t < attack ? t / attack
                    : t > tone.d - release ? (tone.d - t) / release
                    : 1.0;
      v = Math.round(Math.sin(2 * Math.PI * tone.f * t) * env * 0.78 * 32767);
      v = Math.max(-32768, Math.min(32767, v));
    }
    buf.writeInt16LE(v, pos);
    pos += 2;
  }
}

const dir = path.join(__dirname, 'assets', 'sounds');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'ride_alert.wav'), buf);
console.log(`✅ ride_alert.wav — ${buf.length} bytes (${(buf.length / 1024).toFixed(1)} KB)`);
