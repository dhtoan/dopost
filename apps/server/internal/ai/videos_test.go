package ai

import (
	"testing"
)

func TestVideoEndpointsAndInputs(t *testing.T) {
	if got := VideoEndpoint(DefaultVideoModel, false); got != "kling/v4/flash/text-to-video" {
		t.Fatalf("text endpoint = %q", got)
	}
	if got := VideoEndpoint("kling-3-pro", true); got != "fal-ai/kling-video/v3/pro/image-to-video" {
		t.Fatalf("image endpoint = %q", got)
	}
	if VideoEndpoint("unknown", false) != "" {
		t.Fatal("unknown model must have no endpoint")
	}

	flash, _ := VideoModelByID(DefaultVideoModel)
	input := VideoInput(flash, "a lamp", 6, "9:16", true, "")
	if input["duration"] != 6 || input["aspect_ratio"] != "9:16" || input["prompt"] != "a lamp" {
		t.Fatalf("flash text input = %#v", input)
	}
	if _, ok := input["generate_audio"]; ok {
		t.Fatal("Flash has no audio option and must not be sent one")
	}

	pro, _ := VideoModelByID("kling-3-pro")
	input = VideoInput(pro, "a lamp", 8, "16:9", false, "data:image/png;base64,AA==")
	if input["duration"] != "8" || input["start_image_url"] != "data:image/png;base64,AA==" || input["generate_audio"] != false {
		t.Fatalf("pro image input = %#v", input)
	}
	if _, ok := input["aspect_ratio"]; ok {
		t.Fatal("a start image sets the frame shape, so no aspect ratio is sent")
	}
}

func TestVideoEstimate(t *testing.T) {
	flash, _ := VideoModelByID(DefaultVideoModel)
	if got := VideoEstimateMicrousd(flash, 5, true); got != 470_000 {
		t.Fatalf("flash 5 s = %d", got)
	}
	pro, _ := VideoModelByID("kling-3-pro")
	if got := VideoEstimateMicrousd(pro, 10, false); got != 1_120_000 {
		t.Fatalf("pro silent 10 s = %d", got)
	}
	if got := VideoEstimateMicrousd(pro, 10, true); got != 1_680_000 {
		t.Fatalf("pro audio 10 s = %d", got)
	}
}

func TestVideoResultLocation(t *testing.T) {
	ok := []string{
		"https://v3b.fal.media/files/abc/output.mp4",
		"https://storage.googleapis.com/falserverless/out.mp4",
	}
	for _, location := range ok {
		if _, err := videoResultLocation(map[string]any{"video": map[string]any{"url": location}}); err != nil {
			t.Fatalf("%s rejected: %v", location, err)
		}
	}
	bad := []any{
		map[string]any{"video": map[string]any{"url": "http://v3b.fal.media/x.mp4"}},
		map[string]any{"video": map[string]any{"url": "https://evil.example/x.mp4"}},
		map[string]any{"video": map[string]any{"url": "https://fal.media.evil.example/x.mp4"}},
		map[string]any{"video": map[string]any{"url": "https://user@v3b.fal.media/x.mp4"}},
		map[string]any{"video": map[string]any{"url": "https://v3b.fal.media:8443/x.mp4"}},
		map[string]any{"images": []any{map[string]any{"url": "https://v3b.fal.media/x.png"}}},
	}
	for _, result := range bad {
		if _, err := videoResultLocation(result); err == nil {
			t.Fatalf("%#v accepted", result)
		}
	}
}
