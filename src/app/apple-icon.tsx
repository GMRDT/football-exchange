import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#2D5BFF',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 78,
            fontWeight: 900,
            letterSpacing: '-2px',
            fontFamily: 'sans-serif',
          }}
        >
          GC
        </span>
      </div>
    ),
    size
  )
}
