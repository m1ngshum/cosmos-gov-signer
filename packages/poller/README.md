# @cosmos-gov-signer/poller

Stateless governance proposal poller. Fetches active proposals via a `ChainAdapter` and invokes a callback for each one in `VOTING_PERIOD`.

## Usage

```typescript
import { pollProposals } from '@cosmos-gov-signer/poller'
import { MocaChainAdapter } from '@cosmos-gov-signer/adapter-moca'

const adapter = new MocaChainAdapter({ rpcEndpoint: '...', lcdEndpoint: '...' })

await pollProposals(adapter, async (proposal) => {
  // Check if we already have an ApprovalRecord for this proposal
  // If not, create a new auto-NO record
  console.log(`New proposal: #${proposal.id} - ${proposal.title}`)
})
```

## Design

- **Stateless**: No internal tracking of seen proposals. The caller (API layer) handles deduplication.
- **Single invocation**: Not a loop. Designed to be called by a scheduler (e.g. EventBridge every 5 minutes).
- **Filters by status**: Only calls the callback for proposals with status `VOTING_PERIOD`.
