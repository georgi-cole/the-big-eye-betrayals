import StoreProductIcon from '../components/StoreProductModal/StoreProductIcon'
import './betrayals-premium.css'

export function BetrayalsPremiumButton({
  title,
  detail,
  onClick,
}: {
  title: string
  detail: string
  onClick?: () => void
}) {
  return (
    <button className="betrayals-premium-button" type="button" onClick={onClick}>
      <StoreProductIcon name="vip" />
      <span>
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span aria-hidden="true">›</span>
    </button>
  )
}
