//go:build !dev

package main

import (
	"fmt"

	"github.com/openpost/backend/internal/ai"
)

func dopostE2EVideoProvider(enabled bool) (ai.VideoProvider, error) {
	if !enabled {
		return nil, nil
	}
	return nil, fmt.Errorf("dopost E2E video fixtures are unavailable in production builds")
}
