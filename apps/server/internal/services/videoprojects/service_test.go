package videoprojects

import (
	"encoding/json"
	"errors"
	"testing"
)

func TestApplyOperationsTreatsDeleteOfAbsentKeyAsNoOp(t *testing.T) {
	raw := json.RawMessage(`{"timeline":{"items":[{"id":"clip","text":"Cut"}]}}`)
	operations := []MutationOperation{
		{Kind: MutationDelete, Target: "item:clip.effects", Path: "/timeline/items/0/effects"},
		{Kind: MutationSet, Target: "item:clip.text", Path: "/timeline/items/0/text", Value: json.RawMessage(`"Final"`)},
	}

	out, err := applyOperations(raw, operations)
	if err != nil {
		t.Fatalf("applyOperations returned %v", err)
	}
	if got, want := string(out), `{"timeline":{"items":[{"id":"clip","text":"Final"}]}}`; got != want {
		t.Fatalf("document = %s, want %s", got, want)
	}
}

func TestApplyOperationsStillRejectsUnreachablePaths(t *testing.T) {
	raw := json.RawMessage(`{"timeline":{"items":[{"id":"clip"}]}}`)
	for _, operation := range []MutationOperation{
		{Kind: MutationDelete, Target: "item:gone", Path: "/timeline/items/3"},
		{Kind: MutationDelete, Target: "item:gone.effects", Path: "/timeline/items/3/effects"},
		{Kind: MutationDelete, Target: "item:clip.effects", Path: "/timeline/items/0/effects/0"},
		{Kind: MutationSet, Target: "item:clip.text", Path: "/timeline/missing/0/text", Value: json.RawMessage(`"x"`)},
	} {
		if _, err := applyOperations(raw, []MutationOperation{operation}); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s %s: err = %v, want ErrInvalid", operation.Kind, operation.Path, err)
		}
	}
}
