export type EnergyRechargeOffer = {
  watch: () => Promise<boolean>
  pending: boolean
  dailyLimit: boolean
  notice?: string
}

export function BetrayalsEnergyRecharge({
  offer,
  amount,
  showHeading = true,
}: {
  offer: EnergyRechargeOffer
  amount: number
  showHeading?: boolean
}) {
  return (
    <section className="betrayals-energy-recharge" aria-label="Recharge Social Energy">
      {(showHeading || offer.dailyLimit || offer.notice) && (
        <div>
          {showHeading && <strong>Out of Energy</strong>}
          {offer.dailyLimit && <small>Today's ad recharge has already been used.</small>}
          {offer.notice && <small role="status">{offer.notice}</small>}
        </div>
      )}
      {!offer.dailyLimit && (
        <button
          type="button"
          className="sp2-execute"
          disabled={offer.pending}
          onClick={() => void offer.watch()}
        >
          {offer.pending ? 'Opening ad.' : `Watch ad for +${amount} Energy`}
        </button>
      )}
    </section>
  )
}
