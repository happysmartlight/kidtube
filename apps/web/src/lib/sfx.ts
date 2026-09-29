/**
 * Am thanh phan hoi sinh bang WebAudio — khong can file mp3, khong ton bang thong,
 * hoat dong hoan toan offline.
 *
 * Tre can phan hoi tuc thi khi bam de biet "may da nghe minh". Do tre 50ms
 * la du de cam giac "khong an".
 */

let ctx: AudioContext | null = null
let enabled = true
let unlocked = false

/**
 * Trinh duyet chan AudioContext cho tới khi co tuong tac nguoi dung.
 * Goi ham nay tu handler cua lan bam/nhan phim dau tien.
 */
export function unlockAudio(): void {
  if (unlocked) return
  try {
    ctx ??= new AudioContext()
    void ctx.resume()
    unlocked = true
  } catch {
    // Thiet bi khong ho tro WebAudio — im lang la duoc, khong phai loi.
  }
}

export function setSfxEnabled(on: boolean): void {
  enabled = on
}

function tone(
  freqFrom: number,
  freqTo: number,
  durMs: number,
  gainPeak: number,
  type: OscillatorType = 'sine',
): void {
  if (!enabled || !ctx || ctx.state !== 'running') return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freqFrom, now)
  if (freqTo !== freqFrom) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), now + durMs / 1000)
  }

  // Envelope co attack/release ngan de khong bi "tach" (click) o dau va cuoi.
  gain.gain.setValueAtTime(0.0001, now)
  gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.008)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durMs / 1000)

  osc.connect(gain).connect(ctx.destination)
  osc.start(now)
  osc.stop(now + durMs / 1000 + 0.02)
}

export const sfx = {
  /** Di chuyen focus — rat nhe, se nghe hang tram lan. */
  tick(): void {
    tone(1200, 1200, 25, 0.025, 'triangle')
  },

  /** Bam chon. */
  pop(): void {
    tone(660, 990, 90, 0.09)
  },

  /** Quay lai — la pop nguoc. */
  back(): void {
    tone(880, 550, 90, 0.07)
  },

  /** Them/bo yeu thich. */
  heart(): void {
    tone(880, 1320, 120, 0.08, 'triangle')
  },

  /** Sap het gio — 3 not chuong diu, khong gay lo. */
  warn(): void {
    if (!enabled || !ctx) return
    const notes = [880, 1046, 1318]
    notes.forEach((f, i) => {
      setTimeout(() => tone(f, f, 260, 0.06, 'sine'), i * 190)
    })
  },

  /** Het gio — hop am giam dan. */
  timeUp(): void {
    if (!enabled || !ctx) return
    const notes = [784, 659, 523, 392]
    notes.forEach((f, i) => {
      setTimeout(() => tone(f, f, 380, 0.07, 'sine'), i * 230)
    })
  },

  /** Loi / khong bam duoc. */
  nope(): void {
    tone(200, 160, 160, 0.06, 'square')
  },
}
