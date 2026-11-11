import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import Link from "next/link";
import type { ComponentProps } from "react";
import { LoaderCircle } from "lucide-react";

const buttonStyles = {
  primary: "bg-primary text-white shadow-sm hover:bg-primary-hover",
  secondary: "border border-border bg-white text-gray-800 hover:bg-gray-50",
  dark: "bg-gray-900 text-white hover:bg-gray-800",
  ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
};

export function Button({
  children,
  className = "",
  loading = false,
  variant = "primary",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; variant?: keyof typeof buttonStyles }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 ${buttonStyles[variant]} ${className}`}
    >
      {loading && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className = "",
  variant = "primary",
  ...props
}: ComponentProps<typeof Link> & { variant?: keyof typeof buttonStyles }) {
  return <Link {...props} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${buttonStyles[variant]} ${className}`}>{children}</Link>;
}

export function InputField({
  label,
  error,
  hint,
  className = "",
  id,
  name,
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; ref?: Ref<HTMLInputElement> }) {
  const inputId = id ?? name;
  const helpId = `${inputId}-help`;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={inputId} className="block text-sm font-semibold text-gray-800">{label}</label>
      <input
        {...props}
        ref={ref}
        id={inputId}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? helpId : undefined}
        className="min-h-12 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 outline-none transition placeholder:text-gray-600 focus:border-primary focus:ring-4 focus:ring-orange-100 aria-invalid:border-red-400 aria-invalid:focus:ring-red-100"
      />
      {(error || hint) && <p id={helpId} className={`text-xs ${error ? "text-red-700" : "text-secondary"}`} role={error ? "alert" : undefined}>{error ?? hint}</p>}
    </div>
  );
}

export function SelectField({
  label,
  children,
  className = "",
  id,
  name,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const selectId = id ?? name;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={selectId} className="block text-sm font-semibold text-gray-800">{label}</label>
      <select
        {...props}
        id={selectId}
        name={name}
        className="min-h-12 w-full rounded-xl border border-border bg-white px-3.5 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-4 focus:ring-orange-100 disabled:bg-gray-100 disabled:text-gray-500"
      >
        {children}
      </select>
    </div>
  );
}

export function TextAreaField({
  label,
  className = "",
  id,
  name,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const fieldId = id ?? name;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={fieldId} className="block text-sm font-semibold text-gray-800">{label}</label>
      <textarea
        {...props}
        id={fieldId}
        name={name}
        className="min-h-28 w-full resize-y rounded-xl border border-border bg-white px-3.5 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-600 focus:border-primary focus:ring-4 focus:ring-orange-100"
      />
    </div>
  );
}

export function Alert({ children, variant = "error", className = "" }: { children: ReactNode; variant?: "error" | "info"; className?: string }) {
  return (
    <div role={variant === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${variant === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-orange-200 bg-soft text-gray-700"} ${className}`}>
      {children}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-border bg-white shadow-sm ${className}`}>{children}</section>;
}

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10 ${className}`}>{children}</div>;
}

export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center rounded-full bg-soft px-2.5 py-1 text-[11px] font-semibold text-orange-800 ${className}`}>{children}</span>;
}

export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-primary">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 max-w-2xl text-sm leading-6 text-secondary sm:text-base">{description}</p>}
    </div>
  );
}
