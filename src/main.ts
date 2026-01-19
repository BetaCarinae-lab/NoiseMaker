import fs from "fs"

const sampleRate = 44100;
const seconds = 2;
const samples = sampleRate * seconds;

function stringSound(freq: number, length: number, taper = 3) {
  const samples = sampleRate * length;
  const out = new Float32Array(samples);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-taper * t); // natural decay
    out[i] = Math.sin(2 * Math.PI * freq * t) * env;
  }

  return out;
}

function writeWav(samples: Float32Array, filename: string) {
    const buffer = Buffer.alloc(44 + samples.length * 2);

    // WAV header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + samples.length * 2, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(44100, 24);
    buffer.writeUInt32LE(44100 * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write("data", 36);
    buffer.writeUInt32LE(samples.length * 2, 40);

    for (let i = 0; i < samples.length; i++) {
        buffer.writeInt16LE(Math.max(-1, Math.min(1, samples[i])) * 32767, 44 + i * 2);
    }

    fs.writeFileSync(filename, buffer);
}


type note = {
    type: string,
    freq: number,
    length: number,
    sounddef: sound_definers
}

type sound_definers = {
    taper: number,
}


if (process.argv[2]) {
  const json = JSON.parse(fs.readFileSync(process.argv[2]).toString());
  console.log('Running ' + json.init.name);

  // Render each channel
  const channels = json.instructions.map((notes: note[]) =>
    renderChannel(notes)
  );

  console.log(channels)

  // Mix channels into a single buffer
  const data = mixChannels(channels);
  
  writeWav(data, process.argv[3]);
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
    switch (type) {
        case 'strings':
            return stringSound(freq, length, sounddef.taper)

        case 'pause':
            return pause(length)
            
        default: 
            console.log('uhoh, 3:')
            return stringSound(300, 10)
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
