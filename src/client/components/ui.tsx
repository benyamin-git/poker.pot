import type { ButtonHTMLAttributes, ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { IconBack, IconClose } from "./icons";

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

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const classes = ["icon-btn", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}

export function Fab({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  const classes = ["fab", className ?? ""].filter(Boolean).join(" ");
  return (
    <button type="button" className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}

export function BottomTabs({
  items,
}: {
  items: { to: string; label: string; icon: ReactNode }[];
}) {
  return (
    <nav className="bottom-tabs" aria-label="Main">
      {items.map((item) => (
        <NavLink key={item.to} to={item.to} end className="bottom-tabs__item">
          <span className="bottom-tabs__icon" aria-hidden="true">
            {item.icon}
          </span>
          <span className="bottom-tabs__label">{item.label}</span>
        </NavLink>
      ))}
    </nav>
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
        <IconButton label="Back" onClick={onBack}>
          <IconBack />
        </IconButton>
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

export function Sheet({
  title,
  onClose,
  full = false,
  children,
}: {
  title: string;
  onClose: () => void;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={full ? "sheet sheet--full" : "sheet"}>
      <dialog open className="sheet__panel" aria-modal="true" aria-label={title}>
        <header className="sheet__header">
          <h2 className="title-lg">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <IconClose />
          </IconButton>
        </header>
        {children}
      </dialog>
    </div>
  );
}
