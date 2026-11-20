package main

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"

	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	"github.com/cosmos/cosmos-sdk/crypto/keys/secp256k1"
	sdk "github.com/cosmos/cosmos-sdk/types"
	tx "github.com/cosmos/cosmos-sdk/types/tx"
	"github.com/cosmos/cosmos-sdk/types/tx/signing"
	"github.com/cosmos/cosmos-sdk/x/authz"
	gov "github.com/cosmos/cosmos-sdk/x/gov/types/v1"
	"github.com/cosmos/gogoproto/proto"
)

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

func main() {
	// Public deterministic test keys for a synthetic chain ID.
	granterSecret := make([]byte, 32)
	delegateSecret := make([]byte, 32)
	granterSecret[31], delegateSecret[31] = 1, 2
	granterKey := &secp256k1.PrivKey{Key: granterSecret}
	delegateKey := &secp256k1.PrivKey{Key: delegateSecret}
	granter := must(sdk.Bech32ifyAddressBytes("cosmos", granterKey.PubKey().Address()))
	pubkey := delegateKey.PubKey()
	delegate := must(sdk.Bech32ifyAddressBytes("cosmos", pubkey.Address()))
	vote := &gov.MsgVote{ProposalId: 1, Voter: granter, Option: gov.OptionNo}
	exec := &authz.MsgExec{Grantee: delegate, Msgs: []*codectypes.Any{must(codectypes.NewAnyWithValue(vote))}}
	body := must(proto.Marshal(&tx.TxBody{Messages: []*codectypes.Any{must(codectypes.NewAnyWithValue(exec))}}))
	auth := must(proto.Marshal(&tx.AuthInfo{
		SignerInfos: []*tx.SignerInfo{{
			PublicKey: must(codectypes.NewAnyWithValue(pubkey)), Sequence: 7,
			ModeInfo: &tx.ModeInfo{Sum: &tx.ModeInfo_Single_{Single: &tx.ModeInfo_Single{Mode: signing.SignMode_SIGN_MODE_DIRECT}}},
		}},
		Fee: &tx.Fee{Amount: sdk.NewCoins(sdk.NewInt64Coin("uatom", 1000)), GasLimit: 250000},
	}))
	const chainID = "cosmos-fixture-1"
	doc := must(proto.Marshal(&tx.SignDoc{BodyBytes: body, AuthInfoBytes: auth, ChainId: chainID, AccountNumber: 42}))
	sig := must(delegateKey.Sign(doc))
	if !pubkey.VerifySignature(doc, sig) || granterKey.PubKey().VerifySignature(doc, sig) {
		panic("direct signature did not verify exclusively for the delegate")
	}
	digest := sha256.Sum256(doc)
	result := map[string]any{
		"sdkRevision": "bb3fb62963674e6c423e33fcec7029b79f182982",
		"chainId":     chainID, "proposalId": "1", "option": "NO", "granter": granter, "delegate": delegate,
		"delegatePublicKeyHex": hex.EncodeToString(pubkey.Bytes()),
		"accountNumber":        "42", "sequence": "7", "feeAmount": "1000", "gasLimit": "250000",
		"unsignedTxBodyBase64":   base64.StdEncoding.EncodeToString(body),
		"unsignedAuthInfoBase64": base64.StdEncoding.EncodeToString(auth),
		"signDocBase64":          base64.StdEncoding.EncodeToString(doc),
		"sha256Hex":              hex.EncodeToString(digest[:]),
		"signatureHex":           hex.EncodeToString(sig),
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		panic(err)
	}
}
