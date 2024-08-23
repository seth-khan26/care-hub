import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "destructive"
  | "outline"
  | "secondary";

const variantClasses: Record<BadgeVariant, string> = {
  default: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  warning: "bg-yellow-100 text-yellow-800",
  destructive: "bg-red-100 text-red-800",
  outline: "border border-gray-300 text-gray-700",
  secondary: "bg-gray-100 text-gray-700",
};

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export function appointmentStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    SCHEDULED: "secondary",
    CONFIRMED: "default",
    CHECKED_IN: "warning",
    IN_PROGRESS: "warning",
    COMPLETED: "success",
    CANCELLED: "destructive",
    NO_SHOW: "destructive",
  };
  return map[status] ?? "secondary";
}

export function noteStatusBadge(status: string) {
  const map: Record<string, BadgeVariant> = {
    DRAFT: "secondary",
    FINALIZED: "success",
    AMENDED: "warning",
  };
  return map[status] ?? "secondary";
}
