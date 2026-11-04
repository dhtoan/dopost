//go:build dev

package main

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/openpost/backend/internal/ai"
	"github.com/openpost/backend/internal/config"
	"github.com/openpost/backend/internal/services/autovideo"
	"github.com/stretchr/testify/require"
)

func TestDopostE2EPlannerGeneratorIsOptInAndStructured(t *testing.T) {
	disabled, err := dopostE2EPlannerGenerator(false)
	require.NoError(t, err)
	require.Nil(t, disabled)

	generator, err := dopostE2EPlannerGenerator(true)
	require.NoError(t, err)
	require.NotNil(t, generator)

	ideas, err := generator.Generate(context.Background(), ai.GenerateRequest{
		Model:          "fixture",
		UserPrompt:     `{"run_id":"run-e2e","custom_topic":"A deterministic investigation"}`,
		ResponseSchema: &ai.JSONSchema{Name: "documentary_ideas"},
	})
	require.NoError(t, err)
	var ideaPayload struct {
		Ideas []map[string]any `json:"ideas"`
	}
	require.NoError(t, json.Unmarshal([]byte(ideas.Text), &ideaPayload))
	require.Len(t, ideaPayload.Ideas, 10)

	script, err := generator.Generate(context.Background(), ai.GenerateRequest{
		Model:          "fixture",
		UserPrompt:     `{"run_id":"run-e2e","target_word_count":750}`,
		ResponseSchema: &ai.JSONSchema{Name: "documentary_script"},
	})
	require.NoError(t, err)
	var scriptPayload struct {
		Text string `json:"text"`
	}
	require.NoError(t, json.Unmarshal([]byte(script.Text), &scriptPayload))
	require.Len(t, strings.Fields(scriptPayload.Text), 750)

	visuals, err := generator.Generate(context.Background(), ai.GenerateRequest{
		Model: "fixture",
		UserPrompt: `{"run_id":"run-e2e","beats":[` +
			`{"id":"beat-001","index":0,"narration":"One precise fact.","visual_intent":"archival-photo"},` +
			`{"id":"beat-002","index":1,"narration":"Another precise fact.","visual_intent":"archival-photo"}]}`,
		ResponseSchema: &ai.JSONSchema{Name: "documentary_visual_plans"},
	})
	require.NoError(t, err)
	var visualPayload struct {
		Plans []struct {
			BeatID string `json:"beat_id"`
		} `json:"plans"`
	}
	require.NoError(t, json.Unmarshal([]byte(visuals.Text), &visualPayload))
	require.Len(t, visualPayload.Plans, 2)
	require.Equal(t, "beat-001", visualPayload.Plans[0].BeatID)
	require.Equal(t, "beat-002", visualPayload.Plans[1].BeatID)
}

func TestDopostPlannerGeneratorUsesE2EFixtureWhenExplicitlyEnabled(t *testing.T) {
	t.Setenv("OPENPOST_DOPOST_E2E_FIXTURES", "1")
	t.Setenv("DOPOST_AI_PROVIDER", "")
	t.Setenv("DOPOST_GEMINI_API_KEY", "")
	t.Setenv("GEMINI_API_KEY", "")
	t.Setenv("GOOGLE_API_KEY", "")

	generator, model, provider, err := dopostPlannerGenerator(&config.Config{}, nil)
	require.NoError(t, err)
	require.NotNil(t, generator)
	require.Equal(t, "dopost-e2e-fixture", model)
	require.Equal(t, "fixture", provider)
}

func TestDopostE2EFixturePlansEveryShortFormFormat(t *testing.T) {
	service, err := autovideo.New(dopostE2EGenerator{}, "dopost-e2e-fixture")
	require.NoError(t, err)
	for _, format := range []string{"review", "news", "guide", "compare", "top-n"} {
		result, err := service.Plan(t.Context(), autovideo.Input{
			Format:                format,
			Language:              "en-US",
			TargetDurationSeconds: 45,
			Source: autovideo.Source{
				ID:    "source-1",
				Kind:  "text",
				Label: "Notes",
				Value: "The lamp sets up in two minutes. Its battery lasts two days.\nIt costs less than rivals.",
			},
		})
		require.NoError(t, err, format)
		require.Equal(t, "dopost-e2e-fixture", result.Model)
		require.NotEmpty(t, result.Storyboard.Scenes, format)
		require.Equal(t, "The lamp sets up in two minutes.", result.Storyboard.Scenes[0].Voice)
	}
}
