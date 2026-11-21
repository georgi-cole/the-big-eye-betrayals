import type { leadForPlayer } from './intel'

type Props = {
  lead: NonNullable<ReturnType<typeof leadForPlayer>>
  onAsk: () => void
}

export function WitnessLeadCard({ lead, onAsk }: Props) {
  return (
    <section className="betrayals-witness-lead" aria-label="Voting intel">
      <strong>
        {lead.suspect} floated a vote against {lead.pitch}
      </strong>
      <p>
        {lead.source} heard the pitch firsthand and asked you to keep it private. {lead.relay} got
        the story from {lead.source}. {lead.witness} was there too.
      </p>
      {lead.promised ? (
        <p role="status">{lead.witness} will confirm the pitch if you call on them at the table.</p>
      ) : (
        <button type="button" disabled={!lead.canAsk} onClick={onAsk}>
          Ask {lead.witness} privately <span>· 1 energy</span>
        </button>
      )}
    </section>
  )
}
