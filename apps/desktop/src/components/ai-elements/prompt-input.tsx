import type { ComponentProps } from "react";

import { forwardRef } from "react";
import { CornerDownLeftIcon, SquareIcon } from "lucide-react";

import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { designTokens } from "../../lib/designTokens";
import { cn } from "../../lib/utils";

export type PromptInputStatus = "ready" | "submitted" | "streaming" | "error";

type PromptInputRootProps = ComponentProps<"div">;

export function PromptInputRoot({ className, ...props }: PromptInputRootProps) {
  return (
    <div
      data-slot="prompt-input"
      className={cn(
        "mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col rounded-2xl p-3 shadow-[0_10px_25px_rgba(0,0,0,0.06)] focus-within:ring-2 focus-within:ring-primary/30",
        designTokens.classes.panelSurface,
        className,
      )}
      {...props}
    />
  );
}

export const PromptInputForm = forwardRef<HTMLFormElement, ComponentProps<"form">>(function PromptInputForm(
  { className, ...props },
  ref,
) {
  return <form ref={ref} className={cn("flex min-h-0 flex-1 flex-col gap-3", className)} {...props} />;
});

export const PromptInputBody = forwardRef<HTMLDivElement, ComponentProps<"div">>(function PromptInputBody(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex min-h-0 flex-1", className)} {...props} />;
});

export const PromptInputFooter = forwardRef<HTMLDivElement, ComponentProps<"div">>(function PromptInputFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex items-center justify-between gap-3", className)} {...props} />;
});

export const PromptInputTools = forwardRef<HTMLDivElement, ComponentProps<"div">>(function PromptInputTools(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn("flex min-w-0 items-center gap-2", className)} {...props} />;
});

export const PromptInputTextarea = forwardRef<HTMLTextAreaElement, ComponentProps<typeof Textarea>>(function PromptInputTextarea(
  { className, rows = 1, ...props },
  ref,
) {
  return (
    <Textarea
      ref={ref}
      rows={rows}
      className={cn(
        "min-h-[3.5rem] flex-1 resize-none border-none bg-transparent p-2 shadow-none focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  );
});

type PromptInputSubmitProps = Omit<ComponentProps<typeof Button>, "children" | "type"> & {
  onStop?: () => void;
  status: PromptInputStatus;
};

export function PromptInputSubmit({ className, disabled, onStop, status, ...props }: PromptInputSubmitProps) {
  if (status === "submitted" || status === "streaming") {
    return (
      <Button
        type="button"
        size="icon"
        variant="destructive"
        className={cn("rounded-full", className)}
        disabled={disabled || !onStop}
        onClick={onStop}
        aria-label="Stop generating response"
        {...props}
      >
        <SquareIcon data-icon="stop" />
      </Button>
    );
  }

  return (
    <Button
      type="submit"
      size="icon"
      className={cn("rounded-full", className)}
      disabled={disabled}
      aria-label="Send message"
      {...props}
    >
      <CornerDownLeftIcon data-icon="send" />
    </Button>
  );
}
