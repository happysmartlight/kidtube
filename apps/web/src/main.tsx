import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Không tìm thấy #root trong index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: cache vo app de mo nhanh va chay duoc khi mang chap chon.
// Chi dang ky o production — o dev thi SW se cache mat file dang sua.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Trinh duyet TV co the chan SW — khong sao, app van chay binh thuong.
    })
  })
}
