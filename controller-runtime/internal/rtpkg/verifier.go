package rtpkg

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
)

// SupportedSchemaVersion is the package schema version this runtime handles.
const SupportedSchemaVersion = 1

// VerificationResult is returned by Verify.
type VerificationResult struct {
	SchemaValid       bool
	DigestValid       bool
	SignatureValid    bool
	// SignaturePresent is false when the package was never signed (draft/preview).
	SignaturePresent  bool
	Errors            []string
}

// OK returns true only when schema, digest, and signature all pass.
func (r VerificationResult) OK() bool {
	return r.SchemaValid && r.DigestValid && r.SignatureValid
}

// Verify validates a raw package JSON payload against the provided HMAC-SHA256
// signing secret. It replicates the backend's stableStringify → HMAC-SHA256
// signing logic so the result is directly comparable.
//
// Signing algorithm (backend reference: deployment-package.service.ts):
//
//  1. base_document = package WITHOUT signatureMetadata
//  2. digest = SHA-256(stableStringify(base_document))           ← stored in signatureMetadata.digest
//  3. unsigned_document = package WITH signatureMetadata{digest, signature:null, signedAt:null}
//  4. signature = HMAC-SHA256(stableStringify(unsigned_document)) ← stored in signatureMetadata.signature
//
// This function reproduces steps 2–4 on the received bytes and compares.
func Verify(rawPackage []byte, signingSecret string) (VerificationResult, error) {
	result := VerificationResult{}

	// ── Step 1: unmarshal into generic map for stable-stringify operations ──
	var generic interface{}
	if err := json.Unmarshal(rawPackage, &generic); err != nil {
		return result, fmt.Errorf("unmarshal package: %w", err)
	}

	// ── Step 2: validate schema version ────────────────────────────────────
	pkgMap, ok := generic.(map[string]interface{})
	if !ok {
		return result, fmt.Errorf("package is not a JSON object")
	}

	sv, _ := pkgMap["schemaVersion"].(float64) // JSON numbers are float64 in interface{}
	if int(sv) != SupportedSchemaVersion {
		result.Errors = append(result.Errors,
			fmt.Sprintf("unsupported schemaVersion %d (expected %d)", int(sv), SupportedSchemaVersion))
		return result, nil
	}
	result.SchemaValid = true

	// ── Step 3: extract signatureMetadata ──────────────────────────────────
	sigMeta, ok := pkgMap["signatureMetadata"].(map[string]interface{})
	if !ok {
		result.Errors = append(result.Errors, "missing or invalid signatureMetadata")
		return result, nil
	}

	storedDigest, _ := sigMeta["digest"].(string)
	storedSignature, _ := sigMeta["signature"].(string)
	result.SignaturePresent = storedSignature != ""

	// ── Step 4: verify the digest ──────────────────────────────────────────
	// Reconstruct base_document (package without signatureMetadata).
	baseMap := copyMapExcluding(pkgMap, "signatureMetadata")
	computedDigest, err := sha256Hex(stableStringify(baseMap))
	if err != nil {
		return result, fmt.Errorf("compute digest: %w", err)
	}

	if computedDigest != storedDigest {
		result.Errors = append(result.Errors,
			fmt.Sprintf("digest mismatch: stored=%s computed=%s", storedDigest, computedDigest))
		return result, nil
	}
	result.DigestValid = true

	// ── Step 5: verify the HMAC-SHA256 signature ───────────────────────────
	if !result.SignaturePresent {
		// Unsigned package (e.g. draft/preview) — not an error for the
		// verifier, but the caller should record signatureVerified: false.
		result.SignatureValid = false
		return result, nil
	}

	// Build unsigned_document: full package with signature and signedAt set to null.
	unsignedSigMeta := map[string]interface{}{
		"algorithm":       sigMeta["algorithm"],
		"digestAlgorithm": sigMeta["digestAlgorithm"],
		"digest":          storedDigest,
		"signature":       nil,
		"signedAt":        nil,
		"signer":          sigMeta["signer"],
	}
	unsignedMap := copyMapExcluding(pkgMap, "signatureMetadata")
	unsignedMap["signatureMetadata"] = unsignedSigMeta

	computedSig, err := hmacSHA256Hex(stableStringify(unsignedMap), signingSecret)
	if err != nil {
		return result, fmt.Errorf("compute signature: %w", err)
	}

	if !hmac.Equal([]byte(computedSig), []byte(storedSignature)) {
		result.Errors = append(result.Errors, "HMAC-SHA256 signature mismatch")
		return result, nil
	}
	result.SignatureValid = true

	return result, nil
}

// ─── stableStringify ──────────────────────────────────────────────────────────

// stableStringify replicates TypeScript's JSON.stringify(sortObject(value)):
// it recursively sorts object keys alphabetically and produces compact JSON.
// Go's encoding/json already sorts map keys, so we only need to ensure the
// value tree is composed of maps (not structs) before marshalling.
func stableStringify(v interface{}) []byte {
	sorted := sortValue(v)
	data, _ := json.Marshal(sorted) // error impossible for well-formed values
	return data
}

// sortValue recursively normalises a decoded JSON tree so that all objects are
// map[string]interface{} with lexicographically ordered keys. Arrays preserve
// order. Primitive values are returned as-is.
func sortValue(v interface{}) interface{} {
	switch typed := v.(type) {
	case map[string]interface{}:
		keys := make([]string, 0, len(typed))
		for k := range typed {
			keys = append(keys, k)
		}
		sort.Strings(keys)

		ordered := make(map[string]interface{}, len(typed))
		for _, k := range keys {
			ordered[k] = sortValue(typed[k])
		}
		return ordered

	case []interface{}:
		result := make([]interface{}, len(typed))
		for i, elem := range typed {
			result[i] = sortValue(elem)
		}
		return result

	default:
		// string, float64, bool, nil — return unchanged
		return v
	}
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

func sha256Hex(data []byte) (string, error) {
	h := sha256.New()
	if _, err := h.Write(data); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func hmacSHA256Hex(data []byte, secret string) (string, error) {
	mac := hmac.New(sha256.New, []byte(secret))
	if _, err := mac.Write(data); err != nil {
		return "", err
	}
	return hex.EncodeToString(mac.Sum(nil)), nil
}

// ─── Map helpers ──────────────────────────────────────────────────────────────

// copyMapExcluding returns a shallow copy of m omitting the given key.
func copyMapExcluding(m map[string]interface{}, excludeKey string) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		if k != excludeKey {
			out[k] = v
		}
	}
	return out
}
