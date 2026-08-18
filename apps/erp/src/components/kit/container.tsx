import { cn } from "@repo/ui/lib/utils";
import React from "react";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
   children: React.ReactNode;
   className?: string;
}

export function Container({
   children,
   className = "",
   ...props
}: ContainerProps) {
   return (
      <div
         className={cn(
            "mx-auto w-full max-w-352 px-6 sm:px-8 md:px-12 lg:px-16",
            className,
         )}
         {...props}
      >
         {children}
      </div>
   );
}
