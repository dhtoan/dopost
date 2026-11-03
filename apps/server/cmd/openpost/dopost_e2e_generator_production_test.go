//go:build !dev

package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestDopostE2EPlannerGeneratorIsUnavailableInProduction(t *testing.T) {
	disabled, err := dopostE2EPlannerGenerator(false)
	require.NoError(t, err)
	require.Nil(t, disabled)

	enabled, err := dopostE2EPlannerGenerator(true)
	require.Error(t, err)
	require.Nil(t, enabled)
	require.Contains(t, err.Error(), "production")
}
