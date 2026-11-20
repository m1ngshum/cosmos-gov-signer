package main

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"os"

	txsigning "cosmossdk.io/x/tx/signing"
	"github.com/cosmos/cosmos-sdk/codec"
	"github.com/cosmos/cosmos-sdk/codec/address"
	codectypes "github.com/cosmos/cosmos-sdk/codec/types"
	cryptocodec "github.com/cosmos/cosmos-sdk/crypto/codec"
	"github.com/cosmos/cosmos-sdk/crypto/keys/eth/ethsecp256k1"
	sdk "github.com/cosmos/cosmos-sdk/types"
	sdktx "github.com/cosmos/cosmos-sdk/types/tx"
	sdksigning "github.com/cosmos/cosmos-sdk/types/tx/signing"
	"github.com/cosmos/cosmos-sdk/x/auth/signing"
	authtx "github.com/cosmos/cosmos-sdk/x/auth/tx"
	"github.com/cosmos/cosmos-sdk/x/authz"
	gov "github.com/cosmos/cosmos-sdk/x/gov/types/v1"
	"github.com/cosmos/gogoproto/proto"
	"github.com/ethereum/go-ethereum/crypto"
)

func must[T any](value T, err error) T {
	if err != nil {
		panic(err)
	}
	return value
}

func main() {
	const chainID = "moca_222888-1"
	const accountNumber, sequence, gas, proposalID = 42, 7, 250000, 1
	const fee = "2500000000000000"
	addr := address.NewBech32Codec("moca")
	sdk.GetConfig().SetBech32PrefixForAccount("moca", "mocapub")

	// Public deterministic test keys. Never load keys or contact a network.
	key := make([]byte, 32)
	key[31] = 1
	granterKey := must(crypto.ToECDSA(key))
	key[31] = 2
	delegateKey := must(crypto.ToECDSA(key))
	granter := must(addr.BytesToString(crypto.PubkeyToAddress(granterKey.PublicKey).Bytes()))
	delegate := must(addr.BytesToString(crypto.PubkeyToAddress(delegateKey.PublicKey).Bytes()))
	pubkey := &ethsecp256k1.PubKey{Key: crypto.CompressPubkey(&delegateKey.PublicKey)}

	registry := must(codectypes.NewInterfaceRegistryWithOptions(codectypes.InterfaceRegistryOptions{
		ProtoFiles: proto.HybridResolver,
		SigningOptions: txsigning.Options{
			AddressCodec: addr,
		},
	}))
	cryptocodec.RegisterInterfaces(registry)
	authz.RegisterInterfaces(registry)
	gov.RegisterInterfaces(registry)
	txConfig := authtx.NewTxConfig(codec.NewProtoCodec(registry), authtx.DefaultSignModes)

	vote := &gov.MsgVote{ProposalId: proposalID, Voter: granter, Option: gov.OptionNo}
	exec := &authz.MsgExec{Grantee: delegate, Msgs: []*codectypes.Any{must(codectypes.NewAnyWithValue(vote))}}
	builder := txConfig.NewTxBuilder()
	if err := builder.SetMsgs(exec); err != nil {
		panic(err)
	}
	builder.SetFeeAmount(sdk.NewCoins(must(sdk.ParseCoinNormalized(fee + "amoca"))))
	builder.SetGasLimit(gas)
	if err := builder.SetSignatures(sdksigning.SignatureV2{
		PubKey: pubkey, Sequence: sequence,
		Data: &sdksigning.SingleSignatureData{SignMode: sdksigning.SignMode_SIGN_MODE_DIRECT},
	}); err != nil {
		panic(err)
	}
	data := txsigning.SignerData{ChainID: chainID, AccountNumber: accountNumber, Sequence: sequence, Address: delegate}
	ctx := context.Background()
	digest := must(signing.EIP712GetSignBytes(ctx, data, builder.GetTx()))
	signature := must(crypto.Sign(digest, delegateKey))
	if err := signing.EIP712VerifySignature(ctx, data, builder.GetTx(), signature, pubkey); err != nil {
		panic(err)
	}
	if err := signing.EIP712VerifySignature(ctx, data, builder.GetTx(), signature, &ethsecp256k1.PubKey{
		Key: crypto.CompressPubkey(&granterKey.PublicKey),
	}); err == nil {
		panic("MOCA verifier accepted the wrong public key")
	}

	var raw sdktx.TxRaw
	if err := proto.Unmarshal(must(txConfig.TxEncoder()(builder.GetTx())), &raw); err != nil {
		panic(err)
	}
	output := map[string]any{
		"chainRevision": "c88fa7c6bb0659c4f81a454586e23aa2f7245f8a",
		"sdkRevision":   "af93a95df6d153c6ffe7dd4b1e8672bd405af566",
		"chainId":       chainID, "proposalId": "1", "granter": granter, "delegate": delegate, "option": "NO",
		"accountNumber": "42", "sequence": "7", "feeAmount": fee, "gasLimit": "250000",
		"delegatePublicKeyHex":   hex.EncodeToString(crypto.FromECDSAPub(&delegateKey.PublicKey)[1:]),
		"unsignedTxBodyBase64":   base64.StdEncoding.EncodeToString(raw.BodyBytes),
		"unsignedAuthInfoBase64": base64.StdEncoding.EncodeToString(raw.AuthInfoBytes),
		"eip712DigestHex":        "0x" + hex.EncodeToString(digest),
		"signatureHex":           hex.EncodeToString(signature),
	}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(output); err != nil {
		panic(err)
	}
}
