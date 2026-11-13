import type { ComponentPropsWithRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "pension" | "danger";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  /** primary=로또·기본 강조, pension=연금복권 맥락, secondary=테두리 버튼, danger=삭제 등 */
  variant?: ButtonVariant;
  /** 부모 폭 전체 */
  block?: boolean;
};

export function Button({ variant = "primary", block = false, type = "button", className, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={className ? `ll-button ${className}` : "ll-button"}
      data-variant={variant}
      data-block={block}
      {...rest}
    />
  );
}
