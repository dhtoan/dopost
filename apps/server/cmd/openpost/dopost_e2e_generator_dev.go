//go:build dev

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"

	"github.com/openpost/backend/internal/ai"
)

type dopostE2EGenerator struct{}

type dopostE2EVisualBeat struct {
	ID           string `json:"id"`
	Index        int    `json:"index"`
	Narration    string `json:"narration"`
	VisualIntent string `json:"visual_intent"`
}

func dopostE2EPlannerGenerator(enabled bool) (ai.Generator, error) {
	if !enabled {
		return nil, nil
	}
	return dopostE2EGenerator{}, nil
}

func (dopostE2EGenerator) Generate(_ context.Context, request ai.GenerateRequest) (ai.GenerateResult, error) {
	if request.ResponseSchema == nil {
		return ai.GenerateResult{}, fmt.Errorf("dopost E2E fixture requires a response schema")
	}
	var text string
	var err error
	switch request.ResponseSchema.Name {
	case "documentary_ideas":
		text, err = dopostE2EIdeas()
	case "documentary_script":
		text, err = dopostE2EScript(request.UserPrompt)
	case "documentary_visual_plans":
		text, err = dopostE2EVisualPlans(request.UserPrompt)
	case "dopost_auto_video_storyboard":
		text, err = dopostE2EAutoVideoStoryboard(request.SystemPrompt, request.UserPrompt)
	default:
		err = fmt.Errorf("dopost E2E fixture does not support schema %q", request.ResponseSchema.Name)
	}
	if err != nil {
		return ai.GenerateResult{}, err
	}
	return ai.GenerateResult{Text: text, Model: "dopost-e2e-fixture", RequestID: "dopost-e2e-fixture"}, nil
}

func dopostE2EIdeas() (string, error) {
	type idea struct {
		Title           string   `json:"title"`
		Hook            string   `json:"hook"`
		Subterritory    string   `json:"subterritory"`
		EvidenceAnchors []string `json:"evidence_anchors"`
	}
	ideas := make([]idea, 10)
	for index := range ideas {
		number := index + 1
		ideas[index] = idea{
			Title:           fmt.Sprintf("Documentary evidence trail %02d", number),
			Hook:            fmt.Sprintf("Record %02d reveals one verifiable turn in the investigation.", number),
			Subterritory:    fmt.Sprintf("evidence-territory-%02d", number),
			EvidenceAnchors: []string{},
		}
	}
	payload := struct {
		Ideas []idea `json:"ideas"`
	}{Ideas: ideas}
	encoded, err := json.Marshal(payload)
	return string(encoded), err
}

func dopostE2EScript(userPrompt string) (string, error) {
	var input struct {
		TargetWordCount int `json:"target_word_count"`
	}
	if err := json.Unmarshal([]byte(userPrompt), &input); err != nil {
		return "", fmt.Errorf("decode documentary script fixture input: %w", err)
	}
	target := input.TargetWordCount
	if target <= 0 {
		target = 750
	}
	words := make([]string, 0, target)
	for index := 0; len(words) < target; index++ {
		sentence := []string{
			"Record",
			fmt.Sprintf("%03d", index+1),
			"traces",
			"one",
			"verified",
			"event.",
		}
		remaining := target - len(words)
		if remaining < len(sentence) {
			sentence = sentence[:remaining]
		}
		words = append(words, sentence...)
	}
	payload := struct {
		Text         string   `json:"text"`
		EvidenceRefs []string `json:"evidence_refs"`
	}{Text: strings.Join(words, " "), EvidenceRefs: []string{}}
	encoded, err := json.Marshal(payload)
	return string(encoded), err
}

func dopostE2EVisualPlans(userPrompt string) (string, error) {
	var input struct {
		Beats []dopostE2EVisualBeat `json:"beats"`
	}
	if err := json.Unmarshal([]byte(userPrompt), &input); err != nil {
		return "", fmt.Errorf("decode documentary visual fixture input: %w", err)
	}
	if len(input.Beats) == 0 {
		return "", fmt.Errorf("documentary visual fixture requires beats")
	}
	type animation struct {
		Camera        string   `json:"camera"`
		Cadence       string   `json:"cadence"`
		AssemblyOrder string   `json:"assembly_order"`
		HoldRatio     float64  `json:"hold_ratio"`
		AmbientLife   []string `json:"ambient_life"`
	}
	type plan struct {
		BeatID             string    `json:"beat_id"`
		VisualIntent       string    `json:"visual_intent"`
		Hero               string    `json:"hero"`
		Supports           []string  `json:"supports"`
		Label              string    `json:"label"`
		Prompt             string    `json:"prompt"`
		RequiredSubjectIDs []string  `json:"required_subject_ids"`
		Animation          animation `json:"animation"`
	}
	intents := []string{"motion-composition", "paper-document", "map", "number-card", "connection-board"}
	plans := make([]plan, 0, len(input.Beats))
	for index, beat := range input.Beats {
		beatID := strings.TrimSpace(beat.ID)
		if beatID == "" {
			return "", fmt.Errorf("documentary visual fixture beat %d is missing id", index)
		}
		intent := intents[index%len(intents)]
		plans = append(plans, plan{
			BeatID:             beatID,
			VisualIntent:       intent,
			Hero:               fmt.Sprintf("Evidence panel %03d", beat.Index+1),
			Supports:           []string{"paper evidence", "red annotation"},
			Label:              fmt.Sprintf("Evidence %03d", beat.Index+1),
			Prompt:             fmt.Sprintf("Original archival editorial evidence composition for %s with aged paper, restrained red annotations, and clear negative space.", beatID),
			RequiredSubjectIDs: []string{},
			Animation: animation{
				Camera:        "locked",
				Cadence:       "stepped",
				AssemblyOrder: "back-to-front",
				HoldRatio:     0.2,
				AmbientLife:   []string{"paper-corner-lift"},
			},
		})
	}
	payload := struct {
		Plans []plan `json:"plans"`
	}{Plans: plans}
	encoded, err := json.Marshal(payload)
	return string(encoded), err
}

var dopostE2ERoleOrder = regexp.MustCompile(`exact role order: (.+?)\. Choose`)
var dopostE2ERoleEntry = regexp.MustCompile(`^(\S+) \((.+)\)$`)

// dopostE2EAutoVideoStoryboard plans a short-form storyboard the way the real planner
// must: the scene roles in the order the system prompt asks for, narration taken
// from the source's own sentences, and durations that fill the target length.
func dopostE2EAutoVideoStoryboard(systemPrompt, userPrompt string) (string, error) {
	var input struct {
		Title                 string `json:"title"`
		TargetDurationSeconds int    `json:"target_duration_seconds"`
		Source                struct {
			Label string `json:"label"`
			Value string `json:"value"`
		} `json:"source"`
	}
	if err := json.Unmarshal([]byte(userPrompt), &input); err != nil {
		return "", fmt.Errorf("decode auto video fixture input: %w", err)
	}
	match := dopostE2ERoleOrder.FindStringSubmatch(systemPrompt)
	if match == nil {
		return "", fmt.Errorf("auto video fixture could not read the scene order")
	}
	entries := strings.Split(match[1], ", ")
	sentences := strings.FieldsFunc(input.Source.Value, func(r rune) bool { return r == '.' || r == '!' || r == '?' || r == '\n' })
	for index := range sentences {
		sentences[index] = strings.TrimSpace(sentences[index])
	}
	sentences = slicesCompact(sentences)
	if len(sentences) == 0 {
		sentences = []string{"The source has one key point"}
	}
	duration := float64(input.TargetDurationSeconds) / float64(len(entries))
	duration = min(30, max(2, duration))
	type scene struct {
		Role            string  `json:"role"`
		Title           string  `json:"title"`
		Voice           string  `json:"voice"`
		VisualIntent    string  `json:"visual_intent"`
		DurationSeconds float64 `json:"duration_seconds"`
	}
	scenes := make([]scene, 0, len(entries))
	for index, entry := range entries {
		parts := dopostE2ERoleEntry.FindStringSubmatch(strings.TrimSpace(entry))
		if parts == nil {
			return "", fmt.Errorf("auto video fixture could not read scene %q", entry)
		}
		scenes = append(scenes, scene{
			Role:            parts[1],
			Title:           parts[2],
			Voice:           sentences[index%len(sentences)] + ".",
			VisualIntent:    "motion-composition",
			DurationSeconds: duration,
		})
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "Fixture Auto Video"
	}
	encoded, err := json.Marshal(struct {
		Title  string  `json:"title"`
		Scenes []scene `json:"scenes"`
	}{Title: title, Scenes: scenes})
	return string(encoded), err
}

func slicesCompact(values []string) []string {
	kept := values[:0]
	for _, value := range values {
		if value != "" {
			kept = append(kept, value)
		}
	}
	return kept
}
