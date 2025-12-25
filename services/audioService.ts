// Web Audio API implementation for game sounds without external assets

let audioCtx: AudioContext | null = null;
let musicSchedulerId: number | null = null;
let isMusicPlaying = false;

const getContext = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
};

// --- Sound Effects ---

export const playSlowSound = () => {
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  // Descending futuristic "power-down" chime
  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(600, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 0.5);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1000, t);
  filter.frequency.exponentialRampToValueAtTime(100, t + 0.5);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.5);
};

export const playHealSound = () => {
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  // Pleasant upward chime
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.1);
  osc.frequency.exponentialRampToValueAtTime(1200, t + 0.2);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.3, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.3);
};

export const playHitSound = () => {
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const t = ctx.currentTime;
  
  // 1. Softer Noise Burst (Impact)
  const bufferSize = ctx.sampleRate * 0.2;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.5; // Reduced amplitude
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(600, t); // Lower frequency cutoff for softer sound
  noiseFilter.frequency.exponentialRampToValueAtTime(50, t + 0.2);
  
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.3, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
  
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  // Fixed: corrected 'gain' to 'noiseGain' to connect noise impact to destination
  noiseGain.connect(ctx.destination);
  noise.start(t);

  // 2. Low Thud (Reduced attack)
  const osc = ctx.createOscillator();
  osc.type = 'sine'; // Sine is softer than triangle
  osc.frequency.setValueAtTime(100, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + 0.2);
  
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.5, t);
  oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.2);
};

export const playGameOverSound = () => {
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  const t = ctx.currentTime;

  // Deep rumble instead of harsh noise
  const bufferSize = ctx.sampleRate * 2.0;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.setValueAtTime(400, t);
  noiseFilter.frequency.linearRampToValueAtTime(0, t + 2.0);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 2.0);
  
  noise.connect(noiseFilter);
  noiseFilter.connect(gain);
  gain.connect(ctx.destination);
  noise.start(t);

  // Melancholic descending tone
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(20, t + 2.0);
  
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.3, t);
  oscGain.gain.linearRampToValueAtTime(0, t + 2.0);
  
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 2.0);
};


// --- Procedural Music Sequencer (Gentle Ambient) ---

let nextNoteTime = 0;
let beatCount = 0; // Increments by 16th notes
const TEMPO = 70; // Slow, relaxed tempo
const LOOKAHEAD = 25.0; 
const SCHEDULE_AHEAD_TIME = 0.1; 

const scheduleNote = (beatIndex: number, time: number) => {
  const ctx = getContext();
  
  // beatIndex is incrementing by 1 every 16th note.
  // 16 steps per bar (4/4 time).
  const stepInBar = beatIndex % 16;
  const currentBar = Math.floor(beatIndex / 16);
  // Chord progression loop: 4 bars.
  const chordStep = currentBar % 4; 

  // 1. Ambient Pad (Play at start of every bar)
  // Provides a warm, underwater-like background texture
  if (stepInBar === 0) {
      // Progression: Cmaj -> Am -> Fmaj -> Gmaj (Classic, emotional)
      // Frequencies for C3, A2, F2, G2
      let baseFreq = 130.81; // C3
      if (chordStep === 1) baseFreq = 110.00; // A2
      if (chordStep === 2) baseFreq = 87.31;  // F2
      if (chordStep === 3) baseFreq = 98.00;  // G2

      // Play Root and 5th for a stable, open sound
      [baseFreq, baseFreq * 1.5].forEach(freq => {
          const osc = ctx.createOscillator();
          osc.type = 'triangle'; // Softer than sawtooth
          osc.frequency.setValueAtTime(freq, time);

          // Lowpass filter to make it soft and distant
          const filter = ctx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.setValueAtTime(300, time);

          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.12, time + 1.5); // Very slow attack
          gain.gain.linearRampToValueAtTime(0.08, time + 2.5); 
          gain.gain.exponentialRampToValueAtTime(0.001, time + 3.8); // Fade out by end of bar

          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          osc.start(time);
          osc.stop(time + 4.0);
      });
  }

  // 2. Soft "Heartbeat" Pulse (On beat 1 and weak on beat 3)
  // Replaces the aggressive kick drum
  if (stepInBar === 0 || stepInBar === 8) {
     const isStrong = stepInBar === 0;
     const osc = ctx.createOscillator();
     osc.type = 'sine';
     osc.frequency.setValueAtTime(isStrong ? 65 : 55, time);
     osc.frequency.exponentialRampToValueAtTime(30, time + 0.3);
     
     const gain = ctx.createGain();
     gain.gain.setValueAtTime(isStrong ? 0.25 : 0.1, time);
     gain.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
     
     osc.connect(gain);
     gain.connect(ctx.destination);
     osc.start(time);
     osc.stop(time + 0.4);
  }

  // 3. Twinkling Bells (Random Pentatonic notes on 8th notes)
  // Adds a dreamy, floating quality
  // 8th notes are every 2 steps (0, 2, 4...)
  if (beatIndex % 2 === 0) {
      // 40% chance to play a note
      if (Math.random() > 0.6) {
          // C Major Pentatonic (C, D, E, G, A) - High octave
          const notes = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]; 
          const note = notes[Math.floor(Math.random() * notes.length)];
          
          const osc = ctx.createOscillator();
          osc.type = 'sine'; // Pure tone
          osc.frequency.setValueAtTime(note, time);
          
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.04, time + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 1.2); // Long tail
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(time);
          osc.stop(time + 1.5);
      }
  }
};

const scheduler = () => {
  const ctx = getContext();
  // Schedule notes that need to play before the next interval
  while (nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD_TIME) {
    scheduleNote(beatCount, nextNoteTime);
    // Advance time by a 16th note
    nextNoteTime += 60.0 / TEMPO / 4; 
    beatCount++;
  }
  
  if (isMusicPlaying) {
    musicSchedulerId = window.setTimeout(scheduler, LOOKAHEAD);
  }
};

export const startMusic = () => {
  if (isMusicPlaying) return;
  const ctx = getContext();
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  
  isMusicPlaying = true;
  beatCount = 0;
  // Start slightly in the future to avoid glitches
  nextNoteTime = ctx.currentTime + 0.05;
  scheduler();
};

export const stopMusic = () => {
  isMusicPlaying = false;
  if (musicSchedulerId) {
    clearTimeout(musicSchedulerId);
    musicSchedulerId = null;
  }
};