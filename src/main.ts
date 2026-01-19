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

function wiggleSound(frequency: number, duration: number, sampleRate = 44100, sounddef: sound_definers): Float32Array {
    const length = Math.floor(duration * sampleRate);
    const buffer = new Float32Array(length);

    // Envelope parameters (simple ADSR-ish)
    const attack = sounddef.attack ? sounddef.attack : 0.05; // seconds
    const decay = sounddef.decay ? sounddef.decay : 0.2;
    const sustain = sounddef.sustain ? sounddef.sustain : 0.7;
    const release = sounddef.release ? sounddef.release : 0.3;

    // Vibrato parameters
    const vibratoFreq = sounddef.vibratoFreq ? sounddef.vibratoFreq : 5; // Hz
    const vibratoDepth = sounddef.vibratoDepth ? sounddef.vibratoDepth : 5; // Hz

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;

        // Envelope
        let env = 1;
        if (t < attack) env = t / attack;
        else if (t < attack + decay) env = 1 - ((t - attack) / decay) * (1 - sustain);
        else if (t < duration - release) env = sustain;
        else env = sustain * (1 - (t - (duration - release)) / release);

        // Vibrato
        const vibrato = Math.sin(2 * Math.PI * vibratoFreq * t) * vibratoDepth;

        // Base waveform: sawtooth + triangle mix
        const saw = 2 * (t * (frequency + vibrato) - Math.floor(0.5 + t * (frequency + vibrato)));
        const tri = 2 * Math.abs(2 * (t * (frequency + vibrato) - Math.floor(t * (frequency + vibrato) + 0.5))) - 1;

        // Mix waveforms for warmth
        const wave = 0.7 * saw + 0.3 * tri;

        // Simple soft clipping to simulate brass
        const sample = Math.tanh(wave) * env;

        buffer[i] = sample;
    }

    return buffer;
}

function generateKick(sampleRate = 44100, duration = 0.5): Float32Array {
    const length = Math.floor(sampleRate * duration);
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
}

function generateSnare(sampleRate = 44100, duration = 0.3): Float32Array {
    const length = Math.floor(sampleRate * duration);
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

        case 'wiggle':
            return wiggleSound(freq, length, sampleRate, sounddef)

        case 'kick': 
            return generateKick(sampleRate, length)

        case 'snare':
            return generateSnare(sampleRate, length)
            
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
