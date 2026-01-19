import { execSync } from "child_process";
import fs from "fs"
import { Lame } from "node-lame";

const sampleRate = 44100;
const seconds = 2;
const samples = sampleRate * seconds;

interface stringindexable {
  [key: string]: Function;
}

const sounds: stringindexable = {
  strings: function(values: note) {
    const samples = sampleRate * values.length;
    const out = new Float32Array(samples);

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      const env = Math.exp(-values.sounddef.taper * t); // natural decay
      out[i] = Math.sin(2 * Math.PI * values.freq * t) * env;
    }

    return out;
  },

  wiggle: function(values: note): Float32Array {
      const length = Math.floor(values.length * sampleRate);
      const buffer = new Float32Array(length);

      // Envelope parameters (simple ADSR-ish)
      const attack = values.sounddef.attack ? values.sounddef.attack : 0.05; // seconds
      const decay = values.sounddef.decay ? values.sounddef.decay : 0.2;
      const sustain = values.sounddef.sustain ? values.sounddef.sustain : 0.7;
      const release = values.sounddef.release ? values.sounddef.release : 0.3;

      // Vibrato parameters
      const vibratoFreq = values.sounddef.vibratoFreq ? values.sounddef.vibratoFreq : 5; // Hz
      const vibratoDepth = values.sounddef.vibratoDepth ? values.sounddef.vibratoDepth : 5; // Hz

      for (let i = 0; i < length; i++) {
          const t = i / sampleRate;

          // Envelope
          let env = 1;
          if (t < attack) env = t / attack;
          else if (t < attack + decay) env = 1 - ((t - attack) / decay) * (1 - sustain);
          else if (t < length - release) env = sustain;
          else env = sustain * (1 - (t - (length - release)) / release);

          // Vibrato
          const vibrato = Math.sin(2 * Math.PI * vibratoFreq * t) * vibratoDepth;

          // Base waveform: sawtooth + triangle mix
          const saw = 2 * (t * (values.freq + vibrato) - Math.floor(0.5 + t * (values.freq + vibrato)));
          const tri = 2 * Math.abs(2 * (t * (values.freq + vibrato) - Math.floor(t * (values.freq + vibrato) + 0.5))) - 1;

          // Mix waveforms for warmth
          const wave = 0.7 * saw + 0.3 * tri;

          // Simple soft clipping to simulate brass
          const sample = Math.tanh(wave) * env;

          buffer[i] = sample;
    }

    return buffer;
  },

  kick: function(values: note): Float32Array {
      const length = Math.floor(sampleRate * values.length);
      const buffer = new Float32Array(length);

      const startFreq = 150; // Hz, initial pitch
      const endFreq = 50;    // Hz, final pitch
      const decay = 0.4;     // seconds

      for (let i = 0; i < length; i++) {
          const t = i / sampleRate;

          // Exponential pitch drop
          const freq = startFreq * Math.pow(endFreq / startFreq, t / decay);

          // Oscillator (sine wave for kick body)
          const sine = Math.sin(2 * Math.PI * freq * t);

          // Envelope: fast exponential decay
          const env = Math.exp(-t / decay);

          // Optional subtle noise for click
          const noise = (Math.random() * 2 - 1) * 0.05 * Math.exp(-t / 0.02);

          buffer[i] = sine * env + noise;
      }

      return buffer;
  },

  snare: function(values: note): Float32Array {
    const length = Math.floor(sampleRate * values.length);
    const buffer = new Float32Array(length);

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // White noise burst
        const noise = (Math.random() * 2 - 1);

        // Fast decay envelope
        const env = Math.exp(-t / 0.1);

        buffer[i] = noise * env;
    }

    return buffer;
}
}

// WAV writer
function writeWav(samples: Float32Array, filename: string) {
  const numChannels = 1;
  const sampleRate = 44100;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;

  const buffer = Buffer.alloc(44 + samples.length * 2);

  // WAV header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  // Write samples (float → 16‑bit PCM)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }

  fs.writeFileSync(filename, buffer);
  console.log(`WAV written to ${filename}`);
}

async function writeMp3(
  wavBuffer: Buffer,
  filename: string,
  metadata: { title?: string; artist?: string; album?: string; year?: string; comment?: string }
) {
  const encoder = new Lame({
    output: filename,
    bitrate: 192,
    raw: false, // input is WAV
    meta: metadata
  });

  encoder.setBuffer(wavBuffer);
  await encoder.encode();
  console.log(`MP3 written to ${filename} with metadata`);
}

// Main function
async function writeAudio(samples: Float32Array) {
  const filename = process.argv[4] + '.' + process.argv[6];
  if (!filename) {
    console.error("Usage: ts-node writeAudio.ts <output> <format>");
    process.exit(1);
  }

  const format = process.argv[6]?.toLowerCase() ?? "wav";

  if (format === "wav") {
    writeWav(samples, filename);
  } else if (format === "mp3") {
    // First create a WAV in memory
    const wavTemp = Buffer.from(new Uint8Array(
      (() => {
        const numChannels = 1;
        const sampleRate = 44100;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const buf = Buffer.alloc(44 + samples.length * 2);
        buf.write("RIFF", 0);
        buf.writeUInt32LE(36 + samples.length * 2, 4);
        buf.write("WAVE", 8);
        buf.write("fmt ", 12);
        buf.writeUInt32LE(16, 16);
        buf.writeUInt16LE(1, 20);
        buf.writeUInt16LE(numChannels, 22);
        buf.writeUInt32LE(sampleRate, 24);
        buf.writeUInt32LE(byteRate, 28);
        buf.writeUInt16LE(blockAlign, 32);
        buf.writeUInt16LE(bitsPerSample, 34);
        buf.write("data", 36);
        buf.writeUInt32LE(samples.length * 2, 40);
        for (let i = 0; i < samples.length; i++) {
          const s = Math.max(-1, Math.min(1, samples[i]));
          buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
        }
        return buf;
      })()
    ));

    await writeMp3(wavTemp, filename, process.argv[7] == '-m' ? {
      title: process.argv[4],
      artist: execSync('git config --get user.name', { encoding: "utf-8"}).trim(),
      album: "user-album",
      year: new Date().getFullYear().toString(),
      comment: "made using NoiseMaker https://github.com/Betacarinae-lab/NoiseMaker"
    }: {});
  } else {
    console.error(`Unsupported format: ${format}`);
  }
}


type note = {
    type: string,
    freq: number,
    length: number,
    sounddef: sound_definers
}

type sound_definers = {
    taper: number,
    attack: number,
    decay: number,
    sustain: number,
    release: number,
    vibratoFreq: number,
    vibratoDepth: number,
}


if (process.argv[2]) {
  const json = JSON.parse(fs.readFileSync(process.argv[2]).toString());
  console.log('Running ' + json.init.name);

  // Render each channel
  const channels = json.instructions.map((notes: note[]) =>
    renderChannel(notes)
  );

  // Mix channels into a single buffer
  const data = mixChannels(channels);
  
  writeAudio(data);
}

function renderChannel(notes: note[]): Float32Array {
  const buffers = notes.map(n => getData(n.type, n.freq, n.length, n.sounddef));
  return joinF32(buffers); // sequential notes in this channel
}

function mixChannels(channels: Float32Array[]): Float32Array {
  // Find the max length of all channels
  const maxLength = Math.max(...channels.map(c => c.length));
  const out = new Float32Array(maxLength);

  for (const channel of channels) {
    for (let i = 0; i < channel.length; i++) {
      out[i] += channel[i]; // simple additive mix
    }
  }

  // Normalize to prevent clipping
  let max = 0;
    for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 1) {
    for (let i = 0; i < out.length; i++) out[i] /= max;
  }

  return out;
}

function pause(length: number) {
    let newf32 = new Float32Array(length * sampleRate)
    return newf32
}


function getData(type: string, freq: any, length: any, sounddef: any) {
  let result;
  Object.keys(sounds).forEach((key) => {
    if(key == type) {
      result = sounds[key]({freq: freq, length: length, sounddef: sounddef})
    } else {
      // continue;
    }
  })
  if(result) {
    return result
  } else {
    return sounds.strings({freq: 600, length: length, sounddef: null})
  }
}

function joinF32(buffers: Float32Array[]): Float32Array {
  // 1. Compute total length
  let totalLength = 0;
  for (const buf of buffers) {
    totalLength += buf.length;
  }

  // 2. Allocate once
  const out = new Float32Array(totalLength);

  // 3. Copy sequentially
  let offset = 0;
  for (const buf of buffers) {
    out.set(buf, offset);
    offset += buf.length;
  }

  return out;
}
