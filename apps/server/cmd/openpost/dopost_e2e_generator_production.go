//go:build !dev

package main

import (
	"fmt"

	"github.com/openpost/backend/internal/ai"
)

func dopostE2EPlannerGenerator(enabled bool) (ai.Generator, error) {
	if !enabled {
		return nil, nil
	}
	return nil, fmt.Errorf("dopost E2E planner fixtures are unavailable in production builds")
}
