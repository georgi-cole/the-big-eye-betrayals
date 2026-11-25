# Betrayals day flow

| Time             | What happens                                                                                                                                                             | Where you act                     |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Breakfast        | Guests react to who returned, public votes, and any meeting arranged the night before. An ordinary exchange can build trust or give you something specific to follow up. | Social and Intel                  |
| Morning Immunity | The winner is safe at the Table and at Night. A plan aimed at that guest may change over lunch.                                                                          | Immunity Challenge                |
| Lunch            | Guests break into groups after the result. Private vote offers start arriving.                                                                                           | Social, Inbox, and cast portraits |
| Castle afternoon | New conversations take place after Immunity. Check a sighting against an account, ask a witness to speak, negotiate a vote, or arrange cover for Safety.                 | Social, Intel and Inbox           |
| Dusk Safety      | Two Night Shields are awarded. The Immunity winner sits out.                                                                                                             | Safety Challenge                  |
| Before the Table | Guests react to Safety and can ask, bluff, promise, or pass a shield. Opening the Table locks shield ownership and settles conditional testimony.                        | Social, Intel and Inbox           |
| Round Table      | Guests can make a case or speak on someone’s behalf. The first ballot settles vote promises.                                                                             | Round Table discussion and ballot |
| Cocktails        | Review the public ballot, compare stories and work on alliances. Loyal guests can arrange breakfast or leave a sealed account.                                           | Vote ledger, Social and Inbox     |
| Night            | The Conclave decides whom to target. Loyals see the meeting in shadow. The murder scene precedes Dawn.                                                                   | Conclave                          |

Castle scenes are authored in `src/betrayals/castleLifeBank.ts`. The cast, relationships, public results, recent scenes, and actual conversations affect which moment appears. A witness may share a firsthand account, relay a secondhand one, or hold back. An observation records what the player saw and keeps its time of day in Intel. An unanswered conversation can continue among other guests.

The Faux TV carries brief observations and results. Guests start castle conversations in Incoming Social, and My Pulse keeps accounts. Agreed breakfast meetings, replacement vote offers and direct Night Shield requests need a reply before the relevant phase can advance. Players can always decline them.

Saves that are already partway through a day use their current schedule until the next Breakfast.
