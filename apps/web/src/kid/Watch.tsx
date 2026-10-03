import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, kidApi, type PlaybackInfo, type Quota } from '@/lib/api'
import { useNavigate } from '@/lib/router'
import { sfx } from '@/lib/sfx'
import { Controls } from '@/player/Controls'
import {
  INITIAL_STATE,
  LocalPlayer,
  YouTubePlayer,
  type PlayerAdapter,
  type PlayerState,
} from '@/player/PlayerAdapter'
import { EmptyState, Spinner } from '@/ui/Spinner'
import { FocusButton } from '@/ui/Focusable'

const HEARTBEAT_SEC = 15
const CONTROLS_HIDE_MS = 3500

interface WatchProps {
  videoId: number
  profileId: number
  onQuotaBlocked: (quota: Quota) => void
}

export function Watch({ videoId, profileId, onQuotaBlocked }: WatchProps): React.ReactElement {
  const navigate = useNavigate()

  const [info, setInfo] = useState<PlaybackInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState>(INITIAL_STATE)
  const [controlsVisible, setControlsVisible] = useState(true)
  const [ended, setEnded] = useState(false)
  const [embedBlocked, setEmbedBlocked] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const adapterRef = useRef<PlayerAdapter | null>(null)
  const logIdRef = useRef<number | null>(null)
  const hideTimerRef = useRef<number | null>(null)
  /** So video da tu dong phat lien tiep — de chan autoplay vo han. */
  const autoplayCountRef = useRef(0)

  // ─── Hien/an thanh dieu khien ──────────────────────────────────────
  const showControls = useCallback(() => {
    setControlsVisible(true)
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    hideTimerRef.current = window.setTimeout(() => setControlsVisible(false), CONTROLS_HIDE_MS)
  }, [])

  useEffect(() => {
    showControls()
    return () => {
      if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    }
  }, [showControls])

  // ─── Tai thong tin phat ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setEnded(false)

    kidApi
      .video(videoId, profileId)
      .then((data) => {
        if (cancelled) return
        if (data.blocked) {
          onQuotaBlocked(data.quota)
          return
        }
        setInfo(data)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Không mở được video')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [videoId, profileId, onQuotaBlocked])

  const goHome = useCallback(() => {
    navigate('/home')
  }, [navigate])

  // ─── Ket thuc video ────────────────────────────────────────────────
  const handleEnded = useCallback(() => {
    // Thao player NGAY LAP TUC: iframe cua YouTube se hien luoi
    // "video de xuat" ngay sau khi ENDED. Thao truoc la cach duy nhat
    // dam bao tre khong thay cua so ra ngoai whitelist (nguyen tac P4).
    adapterRef.current?.destroy()
    adapterRef.current = null
    setEnded(true)

    void kidApi.watchEnd(profileId, logIdRef.current, true).then(({ quota }) => {
      logIdRef.current = null

      if (!quota.allowed) {
        onQuotaBlocked(quota)
        return
      }

      const next = info?.next
      const canAutoplay =
        info?.autoplay === true &&
        next != null &&
        autoplayCountRef.current + 1 < (info.autoplayMax ?? 3)

      if (canAutoplay && next) {
        autoplayCountRef.current += 1
        navigate(`/watch/${next.id}`)
      } else {
        sfx.pop()
        goHome()
      }
    })
  }, [info, profileId, navigate, goHome, onQuotaBlocked])

  // ─── Khoi tao player ───────────────────────────────────────────────
  useEffect(() => {
    const video = info?.video
    const container = containerRef.current
    if (!video || !container) return

    // Hybrid: file local thi dung <video> (sach quang cao), khong thi stream.
    const adapter: PlayerAdapter = video.localUrl
      ? new LocalPlayer(video.localUrl)
      : new YouTubePlayer(video.youtubeId)

    adapterRef.current = adapter

    void adapter.mount(container, {
      onState: setPlayerState,
      onEnded: handleEnded,
      onError: (msg, blocked) => {
        setError(msg)
        if (blocked) {
          setEmbedBlocked(true)
          // Bao ve server de LAN SAU video nay khong hien cho tre nua.
          // Khong co YT_API_KEY thi day la cach duy nhat biet duoc.
          void kidApi.reportEmbedBlocked(profileId, video.id).catch(() => {})
        }
      },
    })

    void kidApi.watchStart(profileId, video.id).then(({ logId, quota }) => {
      logIdRef.current = logId
      if (!quota.allowed) onQuotaBlocked(quota)
    })

    return () => {
      adapter.destroy()
      adapterRef.current = null
      container.replaceChildren()
    }
    // `handleEnded` doi khi info doi, nhung ta CHI muon dung player khi doi video.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.video?.id])

  // ─── Heartbeat ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!playerState.playing || ended) return

    const timer = window.setInterval(() => {
      void kidApi
        .heartbeat(profileId, logIdRef.current, HEARTBEAT_SEC)
        .then(({ quota }) => {
          if (!quota.allowed) {
            adapterRef.current?.pause()
            onQuotaBlocked(quota)
            return
          }
          if (quota.warning) {
            // Canh bao than thien: 3 not chuong diu, khong cat ngang video.
            sfx.warn()
            showControls()
          }
        })
        .catch(() => {
          // Mat mang tam thoi — cu de video chay, lan heartbeat sau se bu.
        })
    }, HEARTBEAT_SEC * 1000)

    return () => window.clearInterval(timer)
  }, [playerState.playing, ended, profileId, onQuotaBlocked, showControls])

  // Ghi nhan thoi gian da xem khi roi trang giua chung (tre bam Home).
  useEffect(() => {
    return () => {
      if (logIdRef.current !== null) {
        void kidApi.watchEnd(profileId, logIdRef.current, false).catch(() => {})
        logIdRef.current = null
      }
    }
  }, [profileId])

  // ─── Phim tat: mui tien NGANG la TUA, khong di chuyen focus ────────
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const adapter = adapterRef.current
      if (!adapter) return

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          e.stopPropagation()
          adapter.seekBy(-10)
          showControls()
          break
        case 'ArrowRight':
          e.preventDefault()
          e.stopPropagation()
          adapter.seekBy(10)
          showControls()
          break
        case 'ArrowUp':
          e.preventDefault()
          e.stopPropagation()
          adapter.setVolume(Math.min(1, adapter.getState().volume + 0.1))
          showControls()
          break
        case 'ArrowDown':
          e.preventDefault()
          e.stopPropagation()
          adapter.setVolume(Math.max(0, adapter.getState().volume - 0.1))
          showControls()
          break
        case ' ':
        case 'k':
          e.preventDefault()
          adapter.toggle()
          showControls()
          break
        case 'Escape':
        case 'Backspace':
          e.preventDefault()
          e.stopPropagation()
          sfx.back()
          goHome()
          break
      }
    }
    // capture: chay TRUOC spatial navigation o cap window.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [showControls, goHome])

  // ─── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="grid h-full place-items-center" style={{ background: '#000' }}>
        <Spinner label="Đang mở video…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="grid h-full place-items-center" style={{ background: '#000' }}>
        <EmptyState
          emoji={embedBlocked ? '🙈' : '😕'}
          title={embedBlocked ? 'Video này không mở được ở đây' : 'Không xem được video này'}
          hint={
            embedBlocked
              ? 'Kênh này không cho xem ngoài YouTube. Bố mẹ sẽ lo nhé — video này sẽ không hiện nữa.'
              : error
          }
        >
          <FocusButton className="kbtn kbtn-primary mt-3" onClick={goHome} sound="back">
            🏠 Về trang chủ
          </FocusButton>
        </EmptyState>
      </div>
    )
  }

  if (!info?.video) {
    return (
      <div className="grid h-full place-items-center" style={{ background: '#000' }}>
        <EmptyState emoji="🤔" title="Không tìm thấy video">
          <FocusButton className="kbtn kbtn-primary mt-3" onClick={goHome} sound="back">
            🏠 Về trang chủ
          </FocusButton>
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: '#000' }}>
      {/* Khung chua player (iframe hoac <video>) */}
      <div ref={containerRef} className="absolute inset-0" />

      {/*
        OVERLAY CHAN 100% POINTER EVENT (nguyen tac P4).

        Co y KHONG "chua lo" cho vung an toan cua iframe: YouTube co the doi
        layout bat ky luc nao, va mot lo hong o day la tre bam vao tieu de
        roi sang youtube.com. Chan sach, roi tu ve thanh dieu khien rieng.

        Tap vao overlay = bat/tat thanh dieu khien.
      */}
      <button
        type="button"
        className="absolute inset-0 z-10 cursor-default"
        style={{ background: 'transparent', border: 'none' }}
        aria-label="Bấm để hiện hoặc ẩn thanh điều khiển"
        onClick={() => {
          if (controlsVisible) setControlsVisible(false)
          else showControls()
        }}
        onDoubleClick={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Dang tai / dang buffer */}
      {(!playerState.ready || playerState.buffering) && !ended ? (
        <div className="pointer-events-none absolute inset-0 z-[15] grid place-items-center">
          <div
            className="anim-spin rounded-full"
            style={{
              width: 64,
              height: 64,
              border: '7px solid rgba(255,255,255,0.22)',
              borderTopColor: 'var(--focus)',
            }}
          />
        </div>
      ) : null}

      {/* Sau khi player bi thao khi ENDED: che man hinh den, tranh nhay giat
          truoc khi dieu huong di. */}
      {ended ? (
        <div
          className="absolute inset-0 z-[18] grid place-items-center"
          style={{ background: '#000' }}
        >
          <div style={{ fontSize: 56 }} className="anim-wave" aria-hidden="true">
            👋
          </div>
        </div>
      ) : null}

      {!ended ? (
        <Controls
          state={playerState}
          visible={controlsVisible}
          title={info.video.title}
          hasNext={info.next !== null}
          onHome={goHome}
          onToggle={() => {
            adapterRef.current?.toggle()
            showControls()
          }}
          onSeekBy={(d) => {
            adapterRef.current?.seekBy(d)
            showControls()
          }}
          onSeekTo={(s) => {
            adapterRef.current?.seek(s)
            showControls()
          }}
          onVolume={(v) => {
            adapterRef.current?.setVolume(v)
            adapterRef.current?.setMuted(v === 0)
            showControls()
          }}
          onNext={() => {
            if (info.next) navigate(`/watch/${info.next.id}`)
          }}
        />
      ) : null}
    </div>
  )
}
