export const backupPhrase = (words: string[]) => words.join(' ')

export const backupDownloadText = (words: string[]) => {
  const numbered = words.map((word, index) => `${index + 1}. ${word}`).join('\n')
  return [
    'Resilience account backup words',
    '',
    'Keep this file private. Anyone with these words can access your account.',
    'Resilience support will never ask you for them.',
    '',
    numbered,
    '',
    `Backup phrase: ${backupPhrase(words)}`,
    '',
  ].join('\n')
}

