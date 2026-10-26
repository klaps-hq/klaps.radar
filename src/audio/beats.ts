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

export type BeatGrid = { period: number; beats: number[] };

export const detectBeats = async (file: string, maxSeconds = 12): Promise<BeatGrid> => {
  const onset = onsetEnvelope(await decode(file));
  const stepS = HOP / SAMPLE_RATE;
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
  for (let f = bestPhase; f < frames; f += bestLag) beats.push(f * stepS);
  return { period: bestLag * stepS, beats };
};
