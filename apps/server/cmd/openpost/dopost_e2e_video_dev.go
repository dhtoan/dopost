//go:build dev

package main

import (
	"context"
	_ "embed"
	"errors"
	"strings"
	"sync"

	"github.com/google/uuid"
	"github.com/openpost/backend/internal/ai"
)

//go:embed testdata/dopost-e2e-video.mp4
var dopostE2EVideo []byte

// dopostE2EVideos stands in for fal in end-to-end runs: each request reports
// one "generating" poll, then completes with a three-second test clip and no cost.
type dopostE2EVideos struct {
	mu    sync.Mutex
	polls map[string]int
}

func dopostE2EVideoProvider(enabled bool) (ai.VideoProvider, error) {
	if !enabled {
		return nil, nil
	}
	return &dopostE2EVideos{polls: map[string]int{}}, nil
}

func (f *dopostE2EVideos) SubmitVideo(_ context.Context, request ai.VideoRequest) (string, error) {
	if prompt, _ := request.Input["prompt"].(string); strings.Contains(prompt, "fixture-reject") {
		return "", ai.ErrVideoRejected
	}
	return "fixture-" + uuid.NewString(), nil
}

func (f *dopostE2EVideos) VideoStatus(_ context.Context, _, id string) (ai.ImageStatus, error) {
	if !strings.HasPrefix(id, "fixture-") {
		return ai.ImageStatus{}, errors.New("unknown fixture receipt")
	}
	f.mu.Lock()
	defer f.mu.Unlock()
	f.polls[id]++
	if f.polls[id] < 2 {
		return ai.ImageStatus{State: "generating"}, nil
	}
	return ai.ImageStatus{State: "completed"}, nil
}

func (f *dopostE2EVideos) VideoResult(context.Context, string, string) ([]byte, error) {
	return dopostE2EVideo, nil
}

func (f *dopostE2EVideos) VideoCost(context.Context, string, string) (*int64, error) {
	zero := int64(0)
	return &zero, nil
}
