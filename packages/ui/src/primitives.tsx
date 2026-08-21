import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes
} from "react";

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "danger" | "quiet";
export type ControlSize = "small" | "medium" | "large";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ControlSize;
  loading?: boolean;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "medium",
  loading = false,
  startIcon,
  endIcon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx("of-button", `of-button--${variant}`, `of-control--${size}`, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="of-button__loader" aria-hidden="true" /> : startIcon}
      <span>{children}</span>
      {!loading && endIcon}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  label: string;
  variant?: "secondary" | "quiet" | "danger";
  size?: ControlSize;
}

export function IconButton({ label, variant = "quiet", size = "medium", className, type = "button", children, ...props }: IconButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={cx("of-icon-button", `of-icon-button--${variant}`, `of-control--${size}`, className)}
      aria-label={label}
      title={props.title ?? label}
    >
      {children}
    </button>
  );
}

export function PageContainer({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("of-page-container", className)} />;
}

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  description?: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
  headingLevel?: 1 | 2;
}

export function PageHeader({ title, description, kicker, actions, headingLevel = 1, className, ...props }: PageHeaderProps) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <header {...props} className={cx("of-page-header", className)}>
      <div className="of-page-header__copy">
        {kicker && <span className="of-page-header__kicker">{kicker}</span>}
        <Heading>{title}</Heading>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="of-page-header__actions">{actions}</div>}
    </header>
  );
}

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
}

export function Field({ label, htmlFor, hint, error, optional, className, children, ...props }: FieldProps) {
  const messageId = `${htmlFor}-message`;
  return (
    <div {...props} className={cx("of-field", Boolean(error) && "is-invalid", className)}>
      <label htmlFor={htmlFor}>{label}{optional && <span>选填</span>}</label>
      {children}
      {(error || hint) && <small id={messageId} role={error ? "alert" : undefined}>{error || hint}</small>}
    </div>
  );
}

export interface SearchProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon?: ReactNode;
}

export function Search({ label, icon, className, id, ...props }: SearchProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label className={cx("of-search", className)} htmlFor={inputId}>
      {icon}
      <span className="of-sr-only">{label}</span>
      <input {...props} id={inputId} type="search" />
    </label>
  );
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  icon?: ReactNode;
}

export function Select({ label, icon, className, id, children, ...props }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <label className={cx("of-select", className)} htmlFor={selectId}>
      {icon}
      <span className="of-sr-only">{label}</span>
      <select {...props} id={selectId}>{children}</select>
    </label>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={cx("of-card", className)} />;
}

export interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "default" | "success" | "warning";
}

export function Metric({ label, value, detail, tone = "default", className, ...props }: MetricProps) {
  return (
    <div {...props} className={cx("of-metric", `of-metric--${tone}`, className)}>
      <span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}
    </div>
  );
}

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return <span {...props} className={cx("of-badge", `of-badge--${tone}`, className)} />;
}

export function StatusBadge(props: BadgeProps) {
  return <Badge {...props} className={cx("of-status-badge", props.className)} />;
}

export interface TabItem {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}

export function Tabs({ items, value, onChange, label, className, ...props }: TabsProps) {
  const move = (index: number, direction: -1 | 1) => {
    const enabled = items.filter((item) => !item.disabled);
    const current = enabled.findIndex((item) => item.id === items[index]?.id);
    const next = enabled[(current + direction + enabled.length) % enabled.length];
    if (next) onChange(next.id);
  };
  return (
    <div {...props} className={cx("of-tabs", className)} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          disabled={item.disabled}
          aria-selected={value === item.id}
          tabIndex={value === item.id ? 0 : -1}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); move(index, -1); }
            if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); move(index, 1); }
          }}
        >
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function SegmentedControl(props: TabsProps) {
  const { items, value, onChange, label, className, ...rest } = props;
  return (
    <div {...rest} className={cx("of-segmented", className)} role="group" aria-label={label}>
      {items.map((item) => (
        <button key={item.id} type="button" disabled={item.disabled} aria-pressed={value === item.id} onClick={() => onChange(item.id)}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export interface DialogProps extends Omit<HTMLAttributes<HTMLDialogElement>, "title"> {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
}

export function Dialog({ open, title, description, onClose, footer, className, children, ...props }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog {...props} ref={dialogRef} className={cx("of-dialog", className)} onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose}>
      <header><div><h2>{title}</h2>{description && <p>{description}</p>}</div><IconButton label="关闭" onClick={onClose}>×</IconButton></header>
      <div className="of-dialog__body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </dialog>
  );
}

export function Drawer(props: DialogProps) {
  return <Dialog {...props} className={cx("of-dialog", "of-drawer", props.className)} />;
}

export interface StateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action, className, ...props }: StateProps) {
  return <div {...props} className={cx("of-state", "of-state--empty", className)}>{icon}<h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}

export function ErrorState({ icon, title, description, action, className, ...props }: StateProps) {
  return <div {...props} className={cx("of-state", "of-state--error", className)} role="alert">{icon}<h2>{title}</h2>{description && <p>{description}</p>}{action}</div>;
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={cx("of-skeleton", className)} aria-hidden="true" />;
}

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: "info" | "success" | "warning" | "danger";
  title?: ReactNode;
}

export function InlineNotice({ tone = "info", title, className, children, ...props }: NoticeProps) {
  return <div {...props} className={cx("of-notice", `of-notice--${tone}`, className)} role={tone === "danger" ? "alert" : "status"}>{title && <strong>{title}</strong>}<span>{children}</span></div>;
}

export function Toast({ tone = "info", title, className, children, ...props }: NoticeProps) {
  return <div {...props} className={cx("of-toast", `of-notice--${tone}`, className)} role={tone === "danger" ? "alert" : "status"}>{title && <strong>{title}</strong>}<span>{children}</span></div>;
}

export function DataCard({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <article {...props} className={cx("of-data-card", className)} />;
}

export interface ResponsiveColumn<Row> {
  id: string;
  label: ReactNode;
  render: (row: Row) => ReactNode;
  className?: string;
}

export interface ResponsiveTableProps<Row> extends HTMLAttributes<HTMLDivElement> {
  columns: readonly ResponsiveColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  caption: string;
}

export function ResponsiveTable<Row>({ columns, rows, rowKey, caption, className, ...props }: ResponsiveTableProps<Row>) {
  return (
    <div {...props} className={cx("of-responsive-table", className)}>
      <table>
        <caption className="of-sr-only">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column.id} className={column.className}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={rowKey(row)}>{columns.map((column) => <td key={column.id} className={column.className} data-label={typeof column.label === "string" ? column.label : undefined}>{column.render(row)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
