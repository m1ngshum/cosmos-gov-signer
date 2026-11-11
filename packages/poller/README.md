# @m1ngshum/cosmos-gov-signer-poller

A stateless, single-pass governance proposal poller. It fetches proposals through a `ChainAdapter` and awaits a callback for each proposal whose status is `VOTING_PERIOD`.

## Install

```bash
npm install @m1ngshum/cosmos-gov-signer-poller @m1ngshum/cosmos-gov-signer-adapter-moca
```

The adapter is needed for the MOCA example below; applications can supply any implementation of `ChainAdapter`. The package exposes ES module imports and TypeScript declarations.

## Example

Call this function with your RPC/LCD endpoints and application callback. It makes an LCD request when invoked; it does not sign or broadcast.

```typescript
import { pollProposals } from '@m1ngshum/cosmos-gov-signer-poller'
import { MocaChainAdapter } from '@m1ngshum/cosmos-gov-signer-adapter-moca'

export async function scanProposals(
  rpcEndpoint: string,
  lcdEndpoint: string,
  onProposal: Parameters<typeof pollProposals>[1],
) {
  const adapter = new MocaChainAdapter({ rpcEndpoint, lcdEndpoint })
  await pollProposals(adapter, onProposal)
}
```

## Behavior

`pollProposals(adapter, onProposal): Promise<void>` is the only public export.

- Calls `adapter.fetchActiveProposals()` once per invocation.
- Filters by status, not by the local clock or proposal voting dates.
- Awaits callbacks sequentially in the order returned by the adapter.
- Resolves without invoking the callback if no proposal matches.
- Propagates fetch and callback errors. A rejected callback stops that invocation; later proposals are not processed, while earlier callbacks may already have completed.

There is no timer, retry loop, persistent state, or built-in auto-vote policy. Invoke it from your own scheduler and handle failures there.

The callback can receive the same proposal on every poll. Use durable, atomic deduplication keyed by chain and proposal ID before creating an approval record. Retrying a failed poll can repeat callbacks that already succeeded.

Pagination belongs to the adapter. The MOCA adapter follows LCD continuation keys and returns proposals only after every page succeeds. Other adapters must implement their own pagination.
