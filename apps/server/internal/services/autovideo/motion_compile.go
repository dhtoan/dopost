package autovideo

import "github.com/openpost/backend/internal/dopostmotion"

// MotionCompileInput is the narrow server/headless seam between Auto Video
// planning and dopost Motion. It intentionally reuses dopostmotion's native overlay
// contract instead of defining a second project/timeline model in this service.
type MotionCompileInput struct {
	Graph  dopostmotion.SceneGraph
	Width  int
	Height int
	FPS    float64
}

// CompileMotion emits native editable dopost Motion Composition overlays for
// worker/headless generation. The web and server compilers share the same stable
// IDs/control contract, so this never falls back to a flattened video asset.
func CompileMotion(input MotionCompileInput) []dopostmotion.NativeOverlay {
	return dopostmotion.CompileCompositionOverlays(input.Graph, input.Width, input.Height, input.FPS)
}

// CompileMotion exposes the same capability from the planner service when a
// caller already owns one. The operation is pure and does not use the AI model.
func (s *Service) CompileMotion(input MotionCompileInput) []dopostmotion.NativeOverlay {
	return CompileMotion(input)
}
