import './BanishmentIdent.css'

const assetBase = import.meta.env.BASE_URL + 'assets/'

export const banishmentCoin = assetBase + 'ceremonies/final-decision/token.webp'
export const waxEnvelope = assetBase + 'betrayals/wax-envelope.webp'
export const banishmentIdentDuration = 3350

export function BanishmentIdent() {
  return (
    <div className="banishment-ident" aria-hidden="true">
      <div className="banishment-ident__lockup">
        <div className="banishment-ident__lens">
          <div className="banishment-ident__turn">
            <img src={banishmentCoin} className="banishment-ident__eye" alt="" />
            <img src={waxEnvelope} className="banishment-ident__envelope" alt="" />
          </div>
        </div>
        <div className="banishment-ident__brand">
          <strong>The Big Eye</strong>
          <span>Betrayals</span>
        </div>
      </div>
    </div>
  )
}
