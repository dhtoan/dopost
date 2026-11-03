package main

import (
	"os"
	"strings"

	"github.com/openpost/backend/internal/ai"
	"github.com/openpost/backend/internal/config"
	"github.com/openpost/backend/internal/services/autovideo"
	"github.com/openpost/backend/internal/services/documentary"
)

func dopostPlannerGenerator(
	cfg *config.Config,
	openRouterGenerator ai.Generator,
) (ai.Generator, string, string, error) {
	fixtureEnabled := strings.TrimSpace(os.Getenv("OPENPOST_DOPOST_E2E_FIXTURES")) == "1"
	fixtureGenerator, err := dopostE2EPlannerGenerator(fixtureEnabled)
	if err != nil {
		return nil, "", "", err
	}
	if fixtureGenerator != nil {
		return fixtureGenerator, "dopost-e2e-fixture", "fixture", nil
	}

	provider := strings.ToLower(strings.TrimSpace(firstDopostEnv("DOPOST_AI_PROVIDER", "AUNO_AI_PROVIDER")))
	if provider == "" {
		provider = "auto"
	}
	geminiKey := firstDopostEnv("DOPOST_GEMINI_API_KEY", "AUNO_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY")
	useGemini := provider == "gemini" || (provider == "auto" && geminiKey != "")
	if useGemini {
		if geminiKey == "" {
			return nil, "", "", nil
		}
		model := strings.TrimSpace(firstDopostEnv("DOPOST_GEMINI_MODEL", "AUNO_GEMINI_MODEL"))
		if model == "" {
			model = "gemini-2.5-flash"
		}
		generator, err := ai.NewGemini(ai.GeminiConfig{
			APIKey:     geminiKey,
			BaseURL:    strings.TrimSpace(firstDopostEnv("DOPOST_GEMINI_BASE_URL", "AUNO_GEMINI_BASE_URL")),
			Timeout:    contentAIRequestTimeout,
			MaxRetries: 2,
		})
		if err != nil {
			return nil, "", "", err
		}
		return generator, model, "gemini", nil
	}
	if provider != "auto" && provider != "openrouter" {
		return nil, "", "", nil
	}
	if openRouterGenerator == nil {
		return nil, "", "", nil
	}
	return openRouterGenerator, cfg.TextGenerationModel, "openrouter", nil
}

func dopostAutoVideoPlanner(
	cfg *config.Config,
	openRouterGenerator ai.Generator,
) (autovideo.Planner, string, string, error) {
	generator, model, provider, err := dopostPlannerGenerator(cfg, openRouterGenerator)
	if err != nil || generator == nil {
		return nil, model, provider, err
	}
	planner, err := autovideo.New(generator, model)
	return planner, model, provider, err
}

func dopostDocumentaryPlanner(
	cfg *config.Config,
	openRouterGenerator ai.Generator,
) (documentary.Planner, string, string, error) {
	generator, model, provider, err := dopostPlannerGenerator(cfg, openRouterGenerator)
	if err != nil || generator == nil {
		return nil, model, provider, err
	}
	planner, err := documentary.New(generator, model)
	return planner, model, provider, err
}

// firstDopostEnv returns the first non-empty variable. AUNO_* names are read
// as fallbacks so installs configured before the dopost rename keep working.
func firstDopostEnv(keys ...string) string {
	for _, key := range keys {
		if value := strings.TrimSpace(os.Getenv(key)); value != "" {
			return value
		}
	}
	return ""
}
