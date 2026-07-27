import { type ComponentProps } from "solid-js"

// InnexarCode Logo — stylized "<I>" representing code brackets + AI
const GRADIENT = "url(#innexar-grad)"
const GRADIENT_DEF = (
  <defs>
    <linearGradient id="innexar-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#818cf8" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
  </defs>
)

export const Mark = (props: { class?: string }) => {
  return (
    <svg
      data-component="logo-mark"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {GRADIENT_DEF}
      {/* Angle bracket < */}
      <path d="M4 12L10 6V9L7 12L10 15V18L4 12Z" fill={GRADIENT} />
      {/* I */}
      <rect x="11" y="6" width="2" height="12" rx="1" fill={GRADIENT} />
      {/* Angle bracket > */}
      <path d="M20 12L14 18V15L17 12L14 9V6L20 12Z" fill={GRADIENT} />
    </svg>
  )
}

export const Splash = (props: Pick<ComponentProps<"svg">, "ref" | "class">) => {
  return (
    <svg
      ref={props.ref}
      data-component="logo-splash"
      classList={{ [props.class ?? ""]: !!props.class }}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="splash-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#818cf8" />
          <stop offset="50%" stop-color="#6366f1" />
          <stop offset="100%" stop-color="#4f46e5" />
        </linearGradient>
        <linearGradient id="splash-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#1e1b4b" />
          <stop offset="100%" stop-color="#0f0f1a" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="120" height="120" rx="28" fill="url(#splash-bg)" />
      {/* Angle bracket < */}
      <path d="M30 60L45 40V48L37 60L45 72V80L30 60Z" fill="url(#splash-grad)" />
      {/* I */}
      <rect x="52" y="36" width="8" height="48" rx="4" fill="url(#splash-grad)" />
      {/* Angle bracket > */}
      <path d="M90 60L75 80V72L83 60L75 48V40L90 60Z" fill="url(#splash-grad)" />
    </svg>
  )
}

export const Logo = (props: { class?: string }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 48"
      fill="none"
      classList={{ [props.class ?? ""]: !!props.class }}
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#818cf8" />
          <stop offset="100%" stop-color="#6366f1" />
        </linearGradient>
      </defs>
      <g>
        {/* < bracket */}
        <path d="M12 24L20 14V18L16 24L20 30V34L12 24Z" fill="url(#logo-grad)" />
        {/* I */}
        <rect x="24" y="12" width="6" height="24" rx="2" fill="url(#logo-grad)" />
        {/* > bracket */}
        <path d="M44 24L36 34V30L40 24L36 18V14L44 24Z" fill="url(#logo-grad)" />

        {/* InnexarCode text */}
        <text x="62" y="32" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="700" fill="var(--icon-strong-base, #e4e4e7)" letter-spacing="-0.3">InnexarCode</text>
      </g>
    </svg>
  )
}
