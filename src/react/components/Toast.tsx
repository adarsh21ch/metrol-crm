import { useCallback, useEffect, useRef, useState } from 'react'

/** One line of feedback, gone in three seconds — the prototype's behaviour. */
export function useToast() {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number>(0)

  const toast = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 3000)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const node = <div className={'toast' + (msg ? ' is-on' : '')}>{msg}</div>
  return { toast, node }
}
