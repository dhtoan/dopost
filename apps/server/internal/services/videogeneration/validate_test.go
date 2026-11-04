package videogeneration

import "testing"

func TestValidateChecksTheModelLimits(t *testing.T) {
	base := VideoGenerationRequest{WorkspaceID: "ws", ProjectID: "p", Prompt: "a lamp", Model: "kling-4-flash", DurationSec: 5, AspectRatio: "16:9"}
	if err := validate(base); err != nil {
		t.Fatalf("valid request rejected: %v", err)
	}
	for name, change := range map[string]func(*VideoGenerationRequest){
		"unknown model":          func(r *VideoGenerationRequest) { r.Model = "veo" },
		"empty prompt":           func(r *VideoGenerationRequest) { r.Prompt = "" },
		"too short":              func(r *VideoGenerationRequest) { r.DurationSec = 2 },
		"flash too long":         func(r *VideoGenerationRequest) { r.DurationSec = 21 },
		"pro too long":           func(r *VideoGenerationRequest) { r.Model, r.DurationSec = "kling-3-pro", 16 },
		"unsupported shape":      func(r *VideoGenerationRequest) { r.AspectRatio = "21:9" },
		"audio on a quiet model": func(r *VideoGenerationRequest) { r.GenerateAudio = true },
	} {
		request := base
		change(&request)
		if validate(request) == nil {
			t.Errorf("%s accepted", name)
		}
	}
	pro := base
	pro.Model, pro.DurationSec, pro.GenerateAudio = "kling-3-pro", 15, true
	if err := validate(pro); err != nil {
		t.Fatalf("pro with audio rejected: %v", err)
	}
}

func TestLooksLikeMP4(t *testing.T) {
	if !looksLikeMP4([]byte("\x00\x00\x00\x20ftypisom\x00\x00\x02\x00")) {
		t.Fatal("ftyp box not recognised")
	}
	if looksLikeMP4([]byte("<html>not a video</html>")) || looksLikeMP4([]byte("short")) {
		t.Fatal("non-MP4 accepted")
	}
}
