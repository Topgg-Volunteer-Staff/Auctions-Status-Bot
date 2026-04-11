import { resolvedFlag } from '../../globals'

const MAX_THREAD_NAME_LENGTH = 100
const resolvedPrefix = `${resolvedFlag} `
const maxBaseThreadNameLength = MAX_THREAD_NAME_LENGTH - resolvedPrefix.length

export const getResolvedThreadName = (threadName: string): string => {
  if (threadName.startsWith(resolvedFlag)) {
    return threadName.slice(0, MAX_THREAD_NAME_LENGTH)
  }

  const trimmedThreadName = threadName.slice(0, maxBaseThreadNameLength).trimEnd()
  return `${resolvedPrefix}${trimmedThreadName}`
}