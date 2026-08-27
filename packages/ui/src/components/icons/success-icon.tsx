import * as React from "react"

import { cn } from "@repo/ui/lib/utils"

type SuccessIconProps = Omit<React.ComponentProps<"svg">, "children"> & {
  size?: number
  animated?: boolean
}

function SuccessIcon({
  size = 20,
  strokeWidth = 2.25,
  animated = true,
  className,
  ...props
}: SuccessIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("shrink-0", className)}
      {...props}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={animated ? 100 : 0}
        className={animated ? "success-draw-ring" : undefined}
      />
      <path
        d="m8 12.25 2.75 2.75L16 9"
        pathLength={100}
        strokeDasharray={100}
        strokeDashoffset={animated ? 100 : 0}
        className={animated ? "success-draw-check" : undefined}
      />
    </svg>
  )
}

export { SuccessIcon }
