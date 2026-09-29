/**
 * PLAYER ADAPTER — tang truu tuong giua stream YouTube va file da tai ve.
 *
 * Tre KHONG duoc phan biet duoc dang xem cai nao: cung mot thanh dieu khien,
 * cung phim tat, cung hanh vi khi het video. UI chi noi chuyen voi interface
 * nay, khong biet ben duoi la <iframe> hay <video>.
 */

export interface PlayerState {
  ready: boolean
  playing: boolean
  /** Giay. */
  time: number
  /** Giay. 0 khi chua biet. */
  duration: number
  /** 0..1 */
  volume: number
  muted: boolean
  buffering: boolean
}

export const INITIAL_STATE: PlayerState = {
  ready: false,
  playing: false,
  time: 0,
  duration: 0,
  volume: 1,
  muted: false,
  buffering: false,
}

export interface PlayerCallbacks {
  onState: (state: PlayerState) => void
  /** Video da phat het. Adapter PHAI goi truoc khi de endscreen cua YouTube hien. */
  onEnded: () => void
  /**
   * `embedBlocked = true` khi chu kenh chan nhung (ma 101/150).
   * Truong hop nay UI phai bao ve server de lan sau khong hien video do cho tre.
   */
  onError: (message: string, embedBlocked?: boolean) => void
}

export interface PlayerAdapter {
  readonly kind: 'youtube' | 'local'
  mount(container: HTMLElement, cb: PlayerCallbacks): Promise<void>
  play(): void
  pause(): void
  toggle(): void
  /** Nhay den giay tuyet doi. */
  seek(seconds: number): void
  /** Tua tuong doi (+10 / -10). */
  seekBy(delta: number): void
  setVolume(v: number): void
  setMuted(m: boolean): void
  getState(): PlayerState
  destroy(): void
}

// ═══════════════════════════════════════════════════════════════════
// File da tai ve — sach quang cao, khong can mang
// ═══════════════════════════════════════════════════════════════════

export class LocalPlayer implements PlayerAdapter {
  readonly kind = 'local' as const
  private el: HTMLVideoElement | null = null
  private cb: PlayerCallbacks | null = null
  private state: PlayerState = { ...INITIAL_STATE }
  private raf: number | null = null

  constructor(private readonly src: string) {}

  async mount(container: HTMLElement, cb: PlayerCallbacks): Promise<void> {
    this.cb = cb

    const video = document.createElement('video')
    video.src = this.src
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'contain'
    video.style.background = '#000'
    video.playsInline = true
    video.autoplay = true
    // Khong dat `controls`: thanh dieu khien cua trinh duyet co nut tai xuong
    // va menu ngu canh — ta tu ve thanh dieu khien rieng.
    video.controls = false
    video.preload = 'auto'
    // Chan menu chuot phai (co "Luu video thanh...").
    video.addEventListener('contextmenu', (e) => e.preventDefault())

    video.addEventListener('loadedmetadata', () => this.patch({ ready: true, duration: video.duration }))
    video.addEventListener('play', () => this.patch({ playing: true }))
    video.addEventListener('pause', () => this.patch({ playing: false }))
    video.addEventListener('waiting', () => this.patch({ buffering: true }))
    video.addEventListener('playing', () => this.patch({ buffering: false, playing: true }))
    video.addEventListener('ended', () => {
      this.patch({ playing: false })
      cb.onEnded()
    })
    video.addEventListener('error', () => {
      cb.onError('Không phát được file đã tải về. File có thể bị hỏng.')
    })

    container.appendChild(video)
    this.el = video

    // Vong lap cap nhat thoi gian. `timeupdate` cua trinh duyet chi ban
    // ~4 lan/giay nen thanh tien do bi giat; rAF cho chuyen dong muot.
    const loop = (): void => {
      if (this.el) this.patch({ time: this.el.currentTime })
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)

    try {
      await video.play()
    } catch {
      // Trinh duyet chan autoplay co tieng — de tre tu bam Play.
      this.patch({ playing: false })
    }
  }

  private patch(partial: Partial<PlayerState>): void {
    // Chi phat tin hieu khi thuc su doi — tranh render lai vo ich moi frame.
    let changed = false
    for (const [k, v] of Object.entries(partial)) {
      if (this.state[k as keyof PlayerState] !== v) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.state = { ...this.state, ...partial }
    this.cb?.onState(this.state)
  }

  play(): void {
    void this.el?.play().catch(() => {})
  }

  pause(): void {
    this.el?.pause()
  }

  toggle(): void {
    if (!this.el) return
    if (this.el.paused) this.play()
    else this.pause()
  }

  seek(seconds: number): void {
    if (!this.el) return
    const d = this.el.duration || 0
    this.el.currentTime = Math.max(0, d > 0 ? Math.min(seconds, d - 0.3) : seconds)
  }

  seekBy(delta: number): void {
    if (!this.el) return
    this.seek(this.el.currentTime + delta)
  }

  setVolume(v: number): void {
    if (!this.el) return
    const vol = Math.max(0, Math.min(1, v))
    this.el.volume = vol
    this.patch({ volume: vol })
  }

  setMuted(m: boolean): void {
    if (!this.el) return
    this.el.muted = m
    this.patch({ muted: m })
  }

  getState(): PlayerState {
    return this.state
  }

  destroy(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
    if (this.el) {
      this.el.pause()
      // Xoa src va goi load() de trinh duyet nha ket noi ngay,
      // khong tiep tuc tai ngam sau khi roi trang.
      this.el.removeAttribute('src')
      this.el.load()
      this.el.remove()
      this.el = null
    }
    this.cb = null
  }
}

// ═══════════════════════════════════════════════════════════════════
// Stream YouTube qua IFrame API
// ═══════════════════════════════════════════════════════════════════

/** Kieu toi thieu cua YT IFrame API — chi phan ta thuc su dung. */
interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setVolume(v: number): void
  getVolume(): number
  mute(): void
  unMute(): void
  isMuted(): boolean
  destroy(): void
}

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: Record<string, unknown>,
  ) => YTPlayer
  PlayerState: {
    UNSTARTED: number
    ENDED: number
    PLAYING: number
    PAUSED: number
    BUFFERING: number
    CUED: number
  }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<YTNamespace> | null = null

/** Tai script IFrame API mot lan duy nhat cho ca phien. */
function loadYouTubeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise

  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Quá thời gian chờ tải YouTube API. Kiểm tra kết nối mạng.'))
    }, 20_000)

    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer)
      if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube API tải xong nhưng không dùng được'))
    }

    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      clearTimeout(timer)
      apiPromise = null
      reject(new Error('Không tải được YouTube API. Kiểm tra kết nối mạng.'))
    }
    document.head.appendChild(script)
  })

  return apiPromise
}

export class YouTubePlayer implements PlayerAdapter {
  readonly kind = 'youtube' as const
  private player: YTPlayer | null = null
  private cb: PlayerCallbacks | null = null
  private state: PlayerState = { ...INITIAL_STATE }
  private raf: number | null = null
  private destroyed = false

  constructor(private readonly youtubeId: string) {}

  async mount(container: HTMLElement, cb: PlayerCallbacks): Promise<void> {
    this.cb = cb

    let YT: YTNamespace
    try {
      YT = await loadYouTubeApi()
    } catch (err) {
      cb.onError(err instanceof Error ? err.message : 'Không tải được YouTube API')
      return
    }
    if (this.destroyed) return

    const host = document.createElement('div')
    host.style.width = '100%'
    host.style.height = '100%'
    container.appendChild(host)

    this.player = new YT.Player(host, {
      videoId: this.youtubeId,
      // Ten mien privacy-enhanced: khong dat cookie theo doi cho tre.
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        // controls=0 + overlay chan pointer = tre khong cham duoc vao iframe.
        controls: 0,
        rel: 0, // gioi han video lien quan trong cung kenh
        modestbranding: 1,
        iv_load_policy: 3, // an annotation
        disablekb: 1, // iframe khong an phim — ta tu xu ly
        fs: 0, // khong cho fullscreen (se hien UI cua YouTube)
        playsinline: 1,
        autoplay: 1,
        cc_load_policy: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: (e: { target: YTPlayer }) => {
          if (this.destroyed) {
            e.target.destroy()
            return
          }
          this.patch({
            ready: true,
            duration: e.target.getDuration(),
            volume: e.target.getVolume() / 100,
            muted: e.target.isMuted(),
          })
          e.target.playVideo()
        },

        onStateChange: (e: { data: number; target: YTPlayer }) => {
          const S = YT.PlayerState

          if (e.data === S.ENDED) {
            // QUAN TRONG: bao ra ngay de UI thao player truoc khi
            // endscreen "video de xuat" cua YouTube kip hien (nguyen tac P4).
            this.patch({ playing: false })
            this.cb?.onEnded()
            return
          }

          this.patch({
            playing: e.data === S.PLAYING,
            buffering: e.data === S.BUFFERING,
            duration: e.target.getDuration() || this.state.duration,
          })
        },

        onError: (e: { data: number }) => {
          // 101 va 150 deu la "chu kenh khong cho nhung" — rat pho bien voi
          // cac kenh tre em lon (Cocomelon, Super Simple Songs...).
          const embedBlocked = e.data === 101 || e.data === 150
          cb.onError(youtubeErrorMessage(e.data), embedBlocked)
        },
      },
    })

    const loop = (): void => {
      if (this.player && this.state.ready) {
        try {
          this.patch({ time: this.player.getCurrentTime() })
        } catch {
          // Player dang bi thao — bo qua.
        }
      }
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }

  private patch(partial: Partial<PlayerState>): void {
    let changed = false
    for (const [k, v] of Object.entries(partial)) {
      if (this.state[k as keyof PlayerState] !== v) {
        changed = true
        break
      }
    }
    if (!changed) return
    this.state = { ...this.state, ...partial }
    this.cb?.onState(this.state)
  }

  play(): void {
    try {
      this.player?.playVideo()
    } catch {
      /* chua san sang */
    }
  }

  pause(): void {
    try {
      this.player?.pauseVideo()
    } catch {
      /* chua san sang */
    }
  }

  toggle(): void {
    if (this.state.playing) this.pause()
    else this.play()
  }

  seek(seconds: number): void {
    try {
      const d = this.state.duration
      this.player?.seekTo(Math.max(0, d > 0 ? Math.min(seconds, d - 0.3) : seconds), true)
    } catch {
      /* chua san sang */
    }
  }

  seekBy(delta: number): void {
    this.seek(this.state.time + delta)
  }

  setVolume(v: number): void {
    const vol = Math.max(0, Math.min(1, v))
    try {
      this.player?.setVolume(Math.round(vol * 100))
      this.patch({ volume: vol })
    } catch {
      /* chua san sang */
    }
  }

  setMuted(m: boolean): void {
    try {
      if (m) this.player?.mute()
      else this.player?.unMute()
      this.patch({ muted: m })
    } catch {
      /* chua san sang */
    }
  }

  getState(): PlayerState {
    return this.state
  }

  destroy(): void {
    this.destroyed = true
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
    try {
      this.player?.destroy()
    } catch {
      /* da thao roi */
    }
    this.player = null
    this.cb = null
  }
}

/** Ma loi cua IFrame API -> thong diep tieng Viet cho bo me hieu. */
function youtubeErrorMessage(code: number): string {
  switch (code) {
    case 2:
      return 'Mã video không hợp lệ.'
    case 5:
      return 'Trình phát HTML5 không mở được video này.'
    case 100:
      return 'Video không còn tồn tại hoặc đã bị đặt riêng tư.'
    case 101:
    case 150:
      return 'Chủ kênh không cho phép nhúng video này ra ngoài YouTube.'
    default:
      return `Lỗi phát video (mã ${code}).`
  }
}
