// Records the microphone as 16-bit mono WAV. Gradium STT accepts WAV/PCM/Ogg-Opus,
// but not the WebM that MediaRecorder produces in Chrome, so we capture raw PCM ourselves.

const TARGET_RATE = 24000

export class WavRecorder {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private chunks: Float32Array[] = []
  private recording = false
  onLevel: (level: number) => void = () => {}

  async init(): Promise<void> {
    if (this.ctx) return
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    })
    this.ctx = new AudioContext()
    this.source = this.ctx.createMediaStreamSource(this.stream)
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1)
    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0)
      let sum = 0
      for (let i = 0; i < input.length; i++) sum += input[i] * input[i]
      this.onLevel(Math.min(1, Math.sqrt(sum / input.length) * 6))
      if (this.recording) this.chunks.push(new Float32Array(input))
    }
    this.source.connect(this.processor)
    this.processor.connect(this.ctx.destination)
  }

  async start(): Promise<void> {
    await this.init()
    await this.ctx!.resume()
    this.chunks = []
    this.recording = true
  }

  /** Stops recording; returns the WAV and its duration in seconds. */
  stop(): { wav: Blob; seconds: number } {
    this.recording = false
    const rate = this.ctx?.sampleRate ?? 48000
    const length = this.chunks.reduce((n, c) => n + c.length, 0)
    const merged = new Float32Array(length)
    let offset = 0
    for (const c of this.chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    this.chunks = []
    const samples = downsample(merged, rate, TARGET_RATE)
    return { wav: encodeWav(samples, TARGET_RATE), seconds: length / rate }
  }

  close(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    this.ctx?.close()
    this.ctx = null
  }
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (to >= from) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = sum / Math.max(1, end - start)
  }
  return out
}

function encodeWav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const write = (o: number, s: string) => [...s].forEach((ch, i) => view.setUint8(o + i, ch.charCodeAt(0)))
  write(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  write(8, 'WAVE')
  write(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  write(36, 'data')
  view.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}
