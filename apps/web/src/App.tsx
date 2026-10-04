import { useCallback, useEffect, useState } from 'react'
import { AdminApp } from '@/admin/AdminApp'
import { Channels, Home } from '@/kid/Home'
import { KidShell, type KidTab } from '@/kid/KidShell'
import { ProfilePick } from '@/kid/ProfilePick'
import { TimeUp } from '@/kid/TimeUp'
import { Watch } from '@/kid/Watch'
import { adminApi, type KidConfig, type KidProfile, kidApi, type Quota } from '@/lib/api'
import { initMode } from '@/lib/mode'
import { useBackHandler, useBackKeys } from '@/lib/back'
import { backOr, isKidListing, matchPath, useNavigate, usePath } from '@/lib/router'
import { setSfxEnabled, sfx } from '@/lib/sfx'
import { getStoredProfileId, setStoredProfileId } from '@/lib/store'
import { useSpatialNavigation } from '@/nav/spatial'
import { PinDialog } from '@/ui/ParentGate'
import { Spinner } from '@/ui/Spinner'

const DEFAULT_CONFIG: KidConfig = {
  uiModeOverride: 'auto',
  sfxEnabled: true,
  showDuration: true,
  showDownloadBadge: true,
  warnBeforeMin: 5,
}

export function App(): React.ReactElement {
  const path = usePath()
  const navigate = useNavigate()

  const [config, setConfig] = useState<KidConfig | null>(null)
  const [profile, setProfile] = useState<KidProfile | null>(null)
  const [quota, setQuota] = useState<Quota | null>(null)
  const [blocked, setBlocked] = useState<Quota | null>(null)
  const [showPin, setShowPin] = useState(false)
  const [isParent, setIsParent] = useState(false)
  const [booting, setBooting] = useState(true)

  // ─── Khoi dong: cau hinh + phien admin + be da chon ────────────────
  useEffect(() => {
    let cancelled = false

    async function boot(): Promise<void> {
      let cfg = DEFAULT_CONFIG
      try {
        cfg = await kidApi.config()
      } catch {
        // Server chua san sang — dung mac dinh, ProfilePick se bao loi ket noi.
      }
      if (cancelled) return

      setConfig(cfg)
      initMode(cfg.uiModeOverride)
      setSfxEnabled(cfg.sfxEnabled)

      // Bo me co the da dang nhap tu truoc (cookie con hieu luc).
      try {
        const me = await adminApi.me()
        if (!cancelled) setIsParent(me.authenticated)
      } catch {
        /* khong sao */
      }

      // Nho be da chon lan truoc de khong phai chon lai moi lan mo.
      const storedId = getStoredProfileId()
      if (storedId !== null) {
        try {
          const { profiles } = await kidApi.profiles()
          const found = profiles.find((p) => p.id === storedId)
          if (found && !cancelled) setProfile(found)
        } catch {
          /* khong sao */
        }
      }

      if (!cancelled) setBooting(false)
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Dieu huong bang D-pad + nut Back (toan cuc, MOT lan duy nhat) ──
  useSpatialNavigation()
  useBackKeys()

  // Tang duoi cung cua nut Back. Trang xem video va cac hop thoai dang ky
  // tang rieng nam tren — toi duoc day la khong ai trong so do dang mo.
  useBackHandler(() => {
    // Trang bo me / trang xem video (dang bi man "het gio" che) -> ve luoi
    // video cua be. Trang Kenh -> ve Trang chu.
    if (path.startsWith('/admin') || path.startsWith('/watch/')) {
      sfx.back()
      backOr('/home', isKidListing)
    } else if (path === '/channels') {
      sfx.back()
      backOr('/home')
    }
    // Trang chu / chon be: trang dau, khong con cho nao de lui.
  })

  const handleQuotaBlocked = useCallback((q: Quota) => {
    setBlocked(q)
    setQuota(q)
  }, [])

  /**
   * PHAI boc useCallback. Truyen inline arrow function xuong Home lam
   * identity doi moi render -> useEffect cua Home chay lai -> vong lap
   * vo han goi /api/kid/home. (Home cung tu bao ve bang ref, nhung
   * giu on dinh o day la dung dan hon.)
   */
  const handleQuota = useCallback((q: Quota) => {
    setQuota(q)
    if (!q.allowed) setBlocked(q)
  }, [])

  const handleRecheck = useCallback(
    (q: Quota) => {
      setBlocked(null)
      setQuota(q)
      // Thay tai cho: man het gio co the dang o /watch/x — day them /home thi
      // nut Back cua remote lai mo lai video do.
      navigate('/home', { replace: true })
    },
    [navigate],
  )

  const pickProfile = useCallback(
    (p: KidProfile) => {
      setProfile(p)
      setStoredProfileId(p.id)
      setBlocked(null)
      navigate('/home')
    },
    [navigate],
  )

  const switchProfile = useCallback(() => {
    if (profile) void kidApi.closeSession(profile.id).catch(() => {})
    setProfile(null)
    setStoredProfileId(null)
    setQuota(null)
    setBlocked(null)
    navigate('/')
  }, [profile, navigate])

  if (booting || !config) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Đang mở…" />
      </div>
    )
  }

  // ─── Trang quan tri ────────────────────────────────────────────────
  if (isParent && path.startsWith('/admin')) {
    return (
      <AdminApp
        onExit={() => {
          setIsParent(false)
          backOr('/home', isKidListing)
        }}
      />
    )
  }

  const pinDialog = showPin ? (
    <PinDialog
      onSuccess={() => {
        setShowPin(false)
        setIsParent(true)
        navigate('/admin')
      }}
      onCancel={() => setShowPin(false)}
    />
  ) : null

  const openParentGate = (): void => {
    // Da dang nhap roi thi vao thang, khong hoi PIN lai.
    if (isParent) {
      navigate('/admin')
      return
    }

    // Hoi server MOI LAN chu khong nho tu luc khoi dong: bo me co the vua tat
    // hoac bat PIN tu mot may khac. Loi bat ky (mat mang, PIN vua bat lai giua
    // chung) -> roi ve hop nhap PIN nhu binh thuong.
    void adminApi
      .me()
      .then(async (me) => {
        if (!me.authenticated) {
          if (me.pinEnabled) {
            setShowPin(true)
            return
          }
          await adminApi.login('')
        }
        setIsParent(true)
        navigate('/admin')
      })
      .catch(() => setShowPin(true))
  }

  // ─── Chon be ───────────────────────────────────────────────────────
  if (!profile) {
    return (
      <>
        <ProfilePick onPick={pickProfile} onOpenParentGate={openParentGate} />
        {pinDialog}
      </>
    )
  }

  // ─── Het gio ───────────────────────────────────────────────────────
  if (blocked && !blocked.allowed) {
    return (
      <>
        <TimeUp
          quota={blocked}
          profileId={profile.id}
          onRecheck={handleRecheck}
          onSwitchProfile={switchProfile}
          onOpenParentGate={openParentGate}
        />
        {pinDialog}
      </>
    )
  }

  // ─── Xem video (toan man hinh, khong co shell) ─────────────────────
  const watchMatch = matchPath('/watch/:id', path)
  if (watchMatch?.id) {
    const videoId = Number(watchMatch.id)
    if (Number.isFinite(videoId)) {
      return (
        <>
          <Watch
            videoId={videoId}
            profileId={profile.id}
            onQuotaBlocked={handleQuotaBlocked}
          />
          {pinDialog}
        </>
      )
    }
  }

  // ─── Cac trang trong shell ─────────────────────────────────────────
  const tab: KidTab = path === '/channels' ? 'channels' : 'home'

  return (
    <>
      <KidShell
        profile={profile}
        quota={quota}
        tab={tab}
        // Ve Trang chu = LUI lai neu vua tu do sang: bam qua lai giua hai
        // tab khong duoc lam lich su dai ra (Back cua remote = back lich su).
        onTab={(t) => (t === 'home' ? backOr('/home') : navigate(`/${t}`))}
        onSwitchProfile={switchProfile}
        onOpenParentGate={openParentGate}
      >
        {tab === 'home' ? (
          <Home
            profileId={profile.id}
            config={config}
            onSelect={(v) => navigate(`/watch/${v.id}`)}
            onQuota={handleQuota}
          />
        ) : null}

        {tab === 'channels' ? (
          <Channels
            profileId={profile.id}
            config={config}
            onSelect={(v) => navigate(`/watch/${v.id}`)}
            onQuota={handleQuota}
          />
        ) : null}
      </KidShell>
      {pinDialog}
    </>
  )
}
