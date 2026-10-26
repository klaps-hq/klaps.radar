// Beat grid of a music file, so reel cuts land on the actual kicks instead
// of an assumed tempo. Small and dependency-free: ffmpeg decodes to mono
// PCM, an onset envelope (rise in log energy) is autocorrelated to find the
// beat period, and the phase with the strongest onsets anchors the grid.
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const SAMPLE_RATE = 11025;
const HOP = 128; // ~11.6 ms per envelope step
const MIN_BPM = 70;
const MAX_BPM = 170;

const decode = async (file: string): Promise<Float32Array> => {
  const proc = Bun.spawn(
    [FFMPEG, "-loglevel", "error", "-i", file, "-ac", "1", "-ar", String(SAMPLE_RATE), "-f", "f32le", "-"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const data = await new Response(proc.stdout).arrayBuffer();
  if ((await proc.exited) !== 0) {
    throw new Error(`ffmpeg could not decode ${file}`);
  }
  return new Float32Array(data);
};

const onsetEnvelope = (samples: Float32Array): Float32Array => {
  const frames = Math.floor(samples.length / HOP);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f += 1) {
    let sum = 0;
    for (let i = f * HOP; i < (f + 1) * HOP; i += 1) sum += samples[i]! * samples[i]!;
    energy[f] = Math.log1p(sum * 1000);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f += 1) onset[f] = Math.max(0, energy[f]! - energy[f - 1]!);
  return onset;
};

export type BeatGrid = {
  period: number;
  beats: number[];
  // The track's final stinger: the strongest onset in its last seconds.
  // The reel's end card lands on it.
  ending: number;
  duration: number;
};

// The music "ends" where it last stays within this many dB of its typical
// loudness; after that it only decays. The final hit is the last strong
// onset in the window just before that point.
const DECAY_DB = 12;
const ENDING_WINDOW_S = 1.5;
const LOUDNESS_WINDOW_S = 0.05;
const ENDING_HIT_RATIO = 0.7;

// Time of the final hit: the last strong onset shortly before the point
// after which the track never returns to near its typical loudness.
const findEnding = (samples: Float32Array, onset: Float32Array, stepS: number): number => {
  const win = Math.round(LOUDNESS_WINDOW_S * SAMPLE_RATE);
  const levels: number[] = [];
  for (let a = 0; a + win <= samples.length; a += win) {
    let sum = 0;
    for (let i = a; i < a + win; i += 1) sum += samples[i]! * samples[i]!;
    levels.push(10 * Math.log10(sum / win + 1e-12));
  }
  const sorted = [...levels].sort((x, y) => x - y);
  const typical = sorted[Math.floor(sorted.length * 0.9)] ?? 0;
  let last = levels.length - 1;
  while (last > 0 && levels[last]! < typical - DECAY_DB) last -= 1;
  const decayAt = (last + 1) * LOUDNESS_WINDOW_S;

  const from = Math.max(0, Math.floor((decayAt - ENDING_WINDOW_S) / stepS));
  const to = Math.min(onset.length - 1, Math.ceil(decayAt / stepS));
  let strongest = 0;
  for (let f = from; f <= to; f += 1) strongest = Math.max(strongest, onset[f]!);
  // The last hit that is nearly as strong as the strongest one: endings
  // often repeat the hit, and the music ends on the final repetition.
  let finalHit = from;
  for (let f = from; f <= to; f += 1) {
    if (onset[f]! >= strongest * ENDING_HIT_RATIO) finalHit = f;
  }
  return finalHit * stepS;
};

export const detectBeats = async (file: string, maxSeconds = 12): Promise<BeatGrid> => {
  const samples = await decode(file);
  const onset = onsetEnvelope(samples);
  const stepS = HOP / SAMPLE_RATE;
  const duration = samples.length / SAMPLE_RATE;
  const frames = Math.min(onset.length, Math.floor(maxSeconds / stepS));

  // Period: the lag whose autocorrelation is strongest within the tempo
  // range. Slightly favour ~120 bpm so half/double tempo ties resolve to
  // a cutting pace that feels like a reel.
  const minLag = Math.round(60 / MAX_BPM / stepS);
  const maxLag = Math.round(60 / MIN_BPM / stepS);
  let bestLag = Math.round(0.5 / stepS);
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let f = lag; f < frames; f += 1) score += onset[f]! * onset[f - lag]!;
    const bpm = 60 / (lag * stepS);
    score *= Math.exp(-0.5 * Math.log2(bpm / 120) ** 2);
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  // Phase: the offset whose grid collects the most onset energy, allowing
  // a couple of frames of slack per beat.
  let bestPhase = 0;
  let bestSum = -Infinity;
  for (let phase = 0; phase < bestLag; phase += 1) {
    let sum = 0;
    for (let f = phase; f < frames; f += bestLag) {
      sum += Math.max(onset[f - 1] ?? 0, onset[f]!, onset[f + 1] ?? 0);
    }
    if (sum > bestSum) {
      bestSum = sum;
      bestPhase = phase;
    }
  }

  const beats: number[] = [];
  for (let f = bestPhase; f < onset.length; f += bestLag) beats.push(f * stepS);

  // Not snapped to the grid: landing exactly on the hit matters more to
  // the ear than a perfectly regular last bar.
  const ending = findEnding(samples, onset, stepS);

  return { period: bestLag * stepS, beats, ending, duration };
};
