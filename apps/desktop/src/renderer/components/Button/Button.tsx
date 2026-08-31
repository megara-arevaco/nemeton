import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.scss";
type ButtonVariant = "primary" | "secondary" | "ghost" | "setup";

type ButtonSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
}

export function Button({
  className = "",
  children,
  size = "medium",
  type = "button",
  variant = "secondary",
  ...props
}: Readonly<ButtonProps>) {
  return (
    <button
      className={`${styles.button} ${styles[variant]} ${styles[size]} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
