import { ImageResponse } from 'next/og'

export const size = { width: 512, height: 512 }
export const contentType = 'image/png'

export default function AppIcon() {
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
          borderRadius: '115px',
        }}
      >
        <span
          style={{
            color: 'white',
            fontSize: 220,
            fontWeight: 900,
            letterSpacing: '-6px',
            fontFamily: 'sans-serif',
          }}
        >
          FX
        </span>
      </div>
    ),
    size
  )
}
