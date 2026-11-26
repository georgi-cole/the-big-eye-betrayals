import StoreProductIcon from '../components/StoreProductModal/StoreProductIcon'
import './betrayals-premium.css'

export function BetrayalsPremiumButton({
  title,
  detail,
  variant,
  onClick,
}: {
  title: string
  detail: string
  variant?: 'round-table'
  onClick?: () => void
}) {
  return (
    <button
      className="betrayals-premium-button"
      data-variant={variant}
      type="button"
      onClick={onClick}
    >
      <StoreProductIcon name="vip" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span aria-hidden="true">{variant === 'round-table' ? 'Explore' : '›'}</span>
    </button>
  )
}
