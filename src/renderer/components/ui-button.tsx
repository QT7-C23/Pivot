import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../lib/cn'

const buttonVariants = cva(
  'pv-ui-button',
  {
    defaultVariants: { size: 'default', variant: 'primary' },
    variants: {
      size: {
        default: 'pv-ui-button--default',
        icon: 'pv-ui-button--icon',
        sm: 'pv-ui-button--sm',
      },
      variant: {
        primary: 'pv-ui-button--primary',
        secondary: 'pv-ui-button--secondary',
        ghost: 'pv-ui-button--ghost',
        danger: 'pv-ui-button--danger',
        default: 'pv-ui-button--primary',
        outline: 'pv-ui-button--secondary',
        destructive: 'pv-ui-button--danger',
      },
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, className, disabled, loading = false, size, type = 'button', variant, ...props },
  ref,
) {
  return <button
    aria-busy={loading || undefined}
    className={cn(buttonVariants({ className, size, variant }), loading && 'pv-ui-button--loading')}
    disabled={disabled || loading}
    ref={ref}
    type={type}
    {...props}
  >{children}</button>
})
