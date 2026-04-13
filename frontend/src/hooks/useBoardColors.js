import { useState, useEffect } from 'react'

function readBoardColors() {
  const style = getComputedStyle(document.documentElement)
  return {
    dark:  style.getPropertyValue('--board-dark').trim()  || '#1A1A1B',
    light: style.getPropertyValue('--board-light').trim() || '#2E2E30',
  }
}

/**
 * Returns { dark, light } board square colors that update whenever
 * the data-theme attribute on <html> changes.
 */
export function useBoardColors() {
  const [colors, setColors] = useState(readBoardColors)

  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readBoardColors()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return colors
}
