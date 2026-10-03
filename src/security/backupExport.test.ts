import { describe, expect, it } from 'vitest'
import { backupDownloadText, backupPhrase } from './backupExport'

const words = [
  'able',
  'baker',
  'cable',
  'dance',
  'eager',
  'fabric',
  'garden',
  'habit',
  'icon',
  'jacket',
  'keen',
  'label',
]

describe('backup export', () => {
  it('copies words in restoration order', () => {
    expect(backupPhrase(words)).toBe(words.join(' '))
  })

  it('downloads a warning, numbered words, and a machine-copyable phrase', () => {
    const text = backupDownloadText(words)
    expect(text).toContain('Anyone with these words can access your account')
    expect(text).toContain('1. able')
    expect(text).toContain('12. label')
    expect(text).toContain(`Backup phrase: ${words.join(' ')}`)
  })
})

