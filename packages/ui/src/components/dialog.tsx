/**
 * Thin Radix dialog shell, restyled for the studio chrome.
 * Not the default shadcn surface.
 */
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

import { cn } from "../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="hz-overlay" />
      <DialogPrimitive.Content className={cn("hz-dialog", className)} {...props}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
