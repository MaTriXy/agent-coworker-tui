import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 [&>[data-icon]]:pointer-events-none [&>[data-icon]]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:brightness-105",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/85",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-105",
        outline: "border border-border bg-transparent hover:bg-muted/60",
        ghost: "hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 [&>[data-icon]]:size-4",
        sm: "h-8 rounded-md px-3 text-xs [&>[data-icon]]:size-3.5",
        lg: "h-10 rounded-md px-5 [&>[data-icon]]:size-4",
        icon: "size-9 [&>[data-icon]]:size-4",
        "icon-sm": "size-8 [&>[data-icon]]:size-3.5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-size={size ?? undefined}
      data-slot="button"
      data-variant={variant ?? undefined}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
