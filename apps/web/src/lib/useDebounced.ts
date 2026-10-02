import { useEffect, useState } from 'react'

/**
 * Tra ve `value` nhung tre `delay` ms sau lan doi CUOI CUNG.
 *
 * Dung cho o tim kiem realtime: moi ky tu go vao doi `q` ngay (o input khong
 * bi giat), nhung gia tri dung de GOI API chi doi khi nguoi dung ngung go.
 * Go "peppa" = 5 phim bam nhung chi 1 request, khong phai 5.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])

  return debounced
}
