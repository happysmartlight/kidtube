import { getDb } from '../db/index.js'
import type { FilterRuleRow, IngestedVideo } from '../db/types.js'

/**
 * Bo loc tu dong — HO TRO viec duyet, KHONG THAY THE no (nguyen tac P1/P3).
 * Video bi loc se thanh status='rejected' kem ly do, va bo me van xem lai duoc
 * trong tab "Da loai" neu muon phuc hoi.
 */

export interface FilterVerdict {
  blocked: boolean
  reason?: string
}

export function activeRules(): FilterRuleRow[] {
  return getDb()
    .prepare<[], FilterRuleRow>('SELECT * FROM filter_rules WHERE is_active = 1')
    .all()
}

/** Chuan hoa de so khop khong dau, khong phan biet hoa thuong. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // bo dau thanh tieng Viet
    .replace(/đ/g, 'd')
}

export function evaluate(video: IngestedVideo, rules: FilterRuleRow[]): FilterVerdict {
  const titleFolded = fold(video.title)

  for (const rule of rules) {
    switch (rule.type) {
      case 'block_live': {
        if (rule.value === '1' && video.isLive) {
          return { blocked: true, reason: 'Video phát trực tiếp' }
        }
        break
      }

      case 'max_duration': {
        // Bo qua khi chua biet duration (RSS khong cung cap). Da ghi trong
        // PLAN.md phan "No ky thuat": video thieu duration khong bi loc theo do dai.
        if (video.durationSec === null) break
        const max = Number.parseInt(rule.value, 10)
        if (Number.isFinite(max) && video.durationSec > max) {
          return {
            blocked: true,
            reason: `Dài ${fmtMin(video.durationSec)} (giới hạn ${fmtMin(max)})`,
          }
        }
        break
      }

      case 'min_duration': {
        if (video.durationSec === null) break
        const min = Number.parseInt(rule.value, 10)
        if (Number.isFinite(min) && video.durationSec < min) {
          return {
            blocked: true,
            reason: `Chỉ ${video.durationSec}s (tối thiểu ${min}s) — có thể là Shorts`,
          }
        }
        break
      }

      case 'keyword_block': {
        // Cho phep nhieu tu khoa cach nhau bang dau phay trong mot rule.
        for (const kw of rule.value.split(',')) {
          const needle = fold(kw.trim())
          if (needle && titleFolded.includes(needle)) {
            return { blocked: true, reason: `Tiêu đề chứa từ khoá "${kw.trim()}"` }
          }
        }
        break
      }

      case 'title_regex': {
        try {
          if (new RegExp(rule.value, 'iu').test(video.title)) {
            return { blocked: true, reason: `Tiêu đề khớp mẫu /${rule.value}/` }
          }
        } catch {
          // Regex do bo me tu nhap co the sai cu phap — bo qua, khong lam vo ingest.
        }
        break
      }
    }
  }

  return { blocked: false }
}

function fmtMin(sec: number): string {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` : `${m} phút`
}
