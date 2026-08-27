"use client"

import { CircleAlertIcon, InfoIcon, OctagonXIcon } from "lucide-react"
import * as React from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { SuccessIcon } from "@repo/ui/components/icons/success-icon"
import { Spinner } from "@repo/ui/components/spinner"

function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  })
  return () => observer.disconnect()
}

function useDocumentTheme(): "light" | "dark" {
  return React.useSyncExternalStore(
    subscribeToTheme,
    () =>
      document.documentElement.getAttribute("data-theme") === "dark"
        ? "dark"
        : "light",
    () => "light",
  )
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      icons={{
        success: <SuccessIcon size={20} className="text-success" />,
        error: <OctagonXIcon className="size-5 text-destructive" />,
        warning: <CircleAlertIcon className="size-5 text-warning" />,
        info: <InfoIcon className="size-5 text-info" />,
        loading: <Spinner className="size-5 text-muted-foreground" />,
      }}
      toastOptions={{
        classNames: {
          toast: "font-sans gap-3! shadow-[var(--shadow-lg)]!",
          title: "text-sm font-medium tracking-tight",
          description: "text-xs leading-5 text-muted-foreground!",
          content: "gap-1!",
          icon: "size-5!",
          actionButton:
            "h-7! rounded-full! bg-primary! px-3! text-xs! font-medium! text-primary-foreground!",
          cancelButton:
            "h-7! rounded-full! bg-muted! px-3! text-xs! font-medium! text-muted-foreground!",
          closeButton:
            "border-border! text-muted-foreground! hover:border-input! hover:bg-muted! hover:text-foreground!",

          success: "toast-success",
          error: "toast-error",
          warning: "toast-warning",
          info: "toast-info",
          loading: "toast-loading",
        },
        duration: 4000,
      }}
      closeButton
      expand={false}
      visibleToasts={3}
      gap={8}
      {...props}
    />
  )
}

export { Toaster }

export { toast } from "sonner"
export type { ToasterProps }
