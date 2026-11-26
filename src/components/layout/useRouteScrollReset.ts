import { useLayoutEffect, type RefObject } from 'react'
import { useLocation } from 'react-router'

export function useRouteScrollReset(scrollContainer?: RefObject<HTMLElement | null>) {
  const location = useLocation()

  // Clear any offset from the previous screen before the next screen paints.
  useLayoutEffect(() => {
    scrollContainer?.current?.scrollTo?.({ top: 0, left: 0, behavior: 'instant' })
    document.documentElement.scrollTop = 0
    document.documentElement.scrollLeft = 0
    document.body.scrollTop = 0
    document.body.scrollLeft = 0
  }, [location, scrollContainer])
}
