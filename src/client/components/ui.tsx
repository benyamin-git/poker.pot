import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "tonal" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export function Button({
  variant = "tonal",
  size = "md",
  block = false,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    `btn--${variant}`,
    size === "lg" ? "btn--lg" : size === "sm" ? "btn--sm" : "",
    block ? "btn--block" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <div className="screen">{children}</div>;
}

export function TopBar({
  title,
  onBack,
  action,
}: {
  title: ReactNode;
  onBack?: () => void;
  action?: ReactNode;
}) {
  return (
    <header className="topbar">
      {onBack ? (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Back">
          ‹
        </button>
      ) : null}
      <h1 className="topbar__title">{title}</h1>
      {action}
    </header>
  );
}

export function Card({
  children,
  layer,
  tappable,
  onClick,
  className,
}: {
  children: ReactNode;
  layer?: 1 | 3;
  tappable?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const classes = ["card", tappable ? "card--tappable" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");
  const dataLayer = layer ?? 2;
  if (onClick) {
    return (
      <button type="button" className={classes} data-layer={dataLayer} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <div className={classes} data-layer={dataLayer}>
      {children}
    </div>
  );
}

export function Pill({ status, children }: { status?: string; children: ReactNode }) {
  return (
    <span className="pill" data-status={status}>
      {children}
    </span>
  );
}

export function StatRow({
  name,
  value,
  currency,
  signed = false,
}: {
  name: string;
  value: number;
  currency?: string | undefined;
  signed?: boolean;
}) {
  const sign = value > 0 ? "pos" : value < 0 ? "neg" : undefined;
  const text = signed && value > 0 ? `+${value}` : String(value);
  return (
    <div className="stat-row">
      <span className="stat-row__name">{name}</span>
      <span className="stat-row__value" data-sign={sign}>
        {text}
        {currency ? ` ${currency}` : ""}
      </span>
    </div>
  );
}

export function Center({ children }: { children: ReactNode }) {
  return <div className="center">{children}</div>;
}
