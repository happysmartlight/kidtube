/**
 * Icon cua thanh dieu khien trinh phat — SVG ve tay, khong them thu vien.
 *
 * Truoc day dung emoji (🏠 ⏪ ⏸ ⏩ ⏭ 🔊): moi he dieu hanh ve mot kieu, co mau
 * rieng va khung vuong, nhin tho tren nen video. SVG `currentColor` thi mot
 * mau trang dong nhat, net deu, va co theo nut (CSS dat 46% canh nut).
 *
 * Net 2.2 tren khung 24 — day hon icon thuong mot chut cho de nhin tu xa (TV)
 * va tren video dang chay.
 */

type IconProps = { className?: string }

function Svg({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export function IconHome({ className }: IconProps): React.ReactElement {
  return (
    <Svg className={className}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9v10.5a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9" />
    </Svg>
  )
}

/** Tam giac hoi lech phai: tam giac can tam hinh hoc nhin bi lech trai. */
export function IconPlay({ className }: IconProps): React.ReactElement {
  return (
    <Svg className={className}>
      <path d="M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.9-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2z" fill="currentColor" />
    </Svg>
  )
}

export function IconPause({ className }: IconProps): React.ReactElement {
  return (
    <Svg className={className}>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

/** Mui ten vong + so 10 — kieu nut tua cua YouTube. `back` = lui. */
export function IconSeek10({ back, className }: IconProps & { back?: boolean }): React.ReactElement {
  return (
    <Svg className={className}>
      <g transform={back ? undefined : 'matrix(-1 0 0 1 24 0)'}>
        <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
        <path d="M3.5 3.5v4.6h4.6" />
      </g>
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="8.4"
        fontWeight="800"
        fill="currentColor"
        stroke="none"
        fontFamily="inherit"
      >
        10
      </text>
    </Svg>
  )
}

export function IconNext({ className }: IconProps): React.ReactElement {
  return (
    <Svg className={className}>
      <path d="M5 5.6v12.8a.8.8 0 0 0 1.25.66l9.2-6.4a.8.8 0 0 0 0-1.32l-9.2-6.4A.8.8 0 0 0 5 5.6z" fill="currentColor" />
      <path d="M19 5v14" />
    </Svg>
  )
}

export function IconVolume({ muted, className }: IconProps & { muted: boolean }): React.ReactElement {
  return (
    <Svg className={className}>
      <path d="M11 5 6 9H3v6h3l5 4z" fill="currentColor" />
      {muted ? (
        <>
          <path d="m16 9 6 6" />
          <path d="m22 9-6 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.6 5.4a9.5 9.5 0 0 1 0 13.2" />
        </>
      )}
    </Svg>
  )
}
