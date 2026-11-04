package ai

import (
	"context"
	"slices"
	"strconv"
)

// VideoProvider separates paid dispatch from safe reads of a saved receipt,
// like ImageProvider.
type VideoProvider interface {
	SubmitVideo(context.Context, VideoRequest) (string, error)
	VideoStatus(context.Context, string, string) (ImageStatus, error)
	VideoResult(context.Context, string, string) ([]byte, error)
	VideoCost(context.Context, string, string) (*int64, error)
}

// VideoRequest is one provider call: the endpoint and its JSON input.
type VideoRequest struct {
	Endpoint string
	Input    map[string]any
}

// VideoModel is one generation model as the editor offers it. Prices are fal's
// list prices per output second, for an estimate only; billing is reconciled
// from fal's own billing events.
type VideoModel struct {
	ID                     string   `json:"id"`
	Name                   string   `json:"name"`
	MinSeconds             int      `json:"min_seconds"`
	MaxSeconds             int      `json:"max_seconds"`
	DefaultSeconds         int      `json:"default_seconds"`
	AspectRatios           []string `json:"aspect_ratios"`
	Audio                  bool     `json:"audio" doc:"Whether the model can generate a soundtrack"`
	MicrousdPerSecond      int64    `json:"microusd_per_second"`
	AudioMicrousdPerSecond int64    `json:"audio_microusd_per_second,omitempty"`
	TextToVideoEndpoint    string   `json:"-"`
	ImageToVideoEndpoint   string   `json:"-"`
	StringDuration         bool     `json:"-"`
}

const DefaultVideoModel = "kling-4-flash"

var videoModels = []VideoModel{
	{
		ID: DefaultVideoModel, Name: "Kling 4.0 Flash", MinSeconds: 3, MaxSeconds: 20, DefaultSeconds: 5,
		AspectRatios: []string{"16:9", "9:16", "1:1"}, MicrousdPerSecond: 94_000,
		TextToVideoEndpoint: "kling/v4/flash/text-to-video", ImageToVideoEndpoint: "kling/v4/flash/image-to-video",
	},
	{
		ID: "kling-3-pro", Name: "Kling 3.0 Pro", MinSeconds: 3, MaxSeconds: 15, DefaultSeconds: 5,
		AspectRatios: []string{"16:9", "9:16", "1:1"}, Audio: true, MicrousdPerSecond: 112_000, AudioMicrousdPerSecond: 168_000,
		TextToVideoEndpoint: "fal-ai/kling-video/v3/pro/text-to-video", ImageToVideoEndpoint: "fal-ai/kling-video/v3/pro/image-to-video",
		StringDuration: true,
	},
}

func VideoModels() []VideoModel {
	return slices.Clone(videoModels)
}

func VideoModelByID(id string) (VideoModel, bool) {
	for _, model := range videoModels {
		if model.ID == id {
			return model, true
		}
	}
	return VideoModel{}, false
}

// VideoEndpoint is the fal endpoint for a model, from text or from a start image.
func VideoEndpoint(model string, fromImage bool) string {
	found, ok := VideoModelByID(model)
	if !ok {
		return ""
	}
	if fromImage {
		return found.ImageToVideoEndpoint
	}
	return found.TextToVideoEndpoint
}

// VideoInput builds the endpoint input. A start image, when given, is a data URI
// and sets the frame shape, so the aspect ratio is only sent for text prompts.
func VideoInput(model VideoModel, prompt string, seconds int, aspect string, audio bool, startImage string) map[string]any {
	input := map[string]any{"prompt": prompt}
	if model.StringDuration {
		input["duration"] = strconv.Itoa(seconds)
	} else {
		input["duration"] = seconds
	}
	if startImage != "" {
		input["start_image_url"] = startImage
	} else if aspect != "" {
		input["aspect_ratio"] = aspect
	}
	if model.Audio {
		input["generate_audio"] = audio
	}
	return input
}

// VideoEstimateMicrousd is the list-price estimate for one generation.
func VideoEstimateMicrousd(model VideoModel, seconds int, audio bool) int64 {
	rate := model.MicrousdPerSecond
	if audio && model.Audio && model.AudioMicrousdPerSecond > 0 {
		rate = model.AudioMicrousdPerSecond
	}
	return rate * int64(seconds)
}
