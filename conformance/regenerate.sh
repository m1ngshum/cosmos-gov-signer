#!/usr/bin/env bash
set -euo pipefail

# Temporary modules inherit the reference releases' locked dependency graphs.
# Go's checksum database remains enabled. The generators use no chain endpoints.
root=$(cd "$(dirname "$0")" && pwd)
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
export GOWORK=off GOTOOLCHAIN=local GOFLAGS=
export GOPROXY=https://proxy.golang.org GOSUMDB=sum.golang.org GOPRIVATE= GONOSUMDB= GONOPROXY=

fetch_pinned() {
  local url=$1 expected=$2 output=$3
  curl --fail --silent --show-error --location --proto '=https' --max-time 30 "$url" -o "$output"
  printf '%s  %s\n' "$expected" "$output" | shasum -a 256 -c - >&2
}

moca=https://raw.githubusercontent.com/mocachain/moca/c88fa7c6bb0659c4f81a454586e23aa2f7245f8a
sdk=https://raw.githubusercontent.com/cosmos/cosmos-sdk/bb3fb62963674e6c423e33fcec7029b79f182982
mkdir "$work/moca" "$work/direct"
fetch_pinned "$moca/go.mod" 24753d761735ff5942e8a0f6e30ec826cbd2451d8c321373e6d09844f81e9caf "$work/moca/go.mod"
fetch_pinned "$moca/go.sum" 2ed120ace9d383c5ce9138c14cff3489525537b7185803686dcd13821c2ab4f4 "$work/moca/go.sum"
fetch_pinned "$sdk/go.mod" 645e80b18c00964efb63205ffb9e873e9ab5c65f8163498936559766d707bbc3 "$work/direct/go.mod"
fetch_pinned "$sdk/go.sum" 9c71d18642cf673a25342844c86d83ac3b6c10edafd404131c8ba17dde872b1b "$work/direct/go.sum"
cp "$root/reference/moca.go" "$work/moca/main.go"
cp "$root/reference/direct.go" "$work/direct/main.go"

(cd "$work/moca" && CGO_ENABLED=1 go run -mod=readonly .) > "$work/moca-vote.json"
(
  cd "$work/direct"
  go mod edit -module example.invalid/cosmos-reference -require github.com/cosmos/cosmos-sdk@v0.55.1
  cat >> go.sum <<'SUMS'
github.com/cosmos/cosmos-sdk v0.55.1 h1:gnBWht7VwjCRLWnn7cwy8TLOkQ6tJU1b+zlwph/Cn7g=
github.com/cosmos/cosmos-sdk v0.55.1/go.mod h1:GiLs6nOCnJlc3ykxs4K1Nl+/oJnpD/HPVTSxRy5O3Yg=
SUMS
  CGO_ENABLED=0 go run -mod=readonly .
) > "$work/cosmos-direct.json"

for fixture in moca-vote cosmos-direct; do
  diff -u "$root/fixtures/$fixture.json" "$work/$fixture.json"
done
