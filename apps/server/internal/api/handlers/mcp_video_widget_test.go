package handlers

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestMCPVideoWidgetToolPointsAtItsOwnWidget(t *testing.T) {
	tool := mcpRenderVideoPlayerTool()
	require.Equal(t, mcpToolRenderVideo, tool["name"])
	meta := tool["_meta"].(map[string]any)
	require.Equal(t, mcpVideoWidgetURI, meta["openai/outputTemplate"])
	require.Equal(t, mcpVideoWidgetURI, meta["ui"].(map[string]any)["resourceUri"])
	// The widget calls itself to switch videos and renew playback links.
	require.Equal(t, true, meta["openai/widgetAccessible"])
	annotations := tool["annotations"].(map[string]any)
	require.Equal(t, true, annotations["readOnlyHint"])
	require.Equal(t, false, annotations["destructiveHint"])
	schema := tool["inputSchema"].(map[string]any)
	require.Equal(t, []string{"workspace_id"}, schema["required"])
	require.Contains(t, schema["properties"], "media_id")
}

func TestMCPVideoWidgetIsListedForReadOnlyAndFullScopes(t *testing.T) {
	for _, scope := range []string{mcpScopeFull, mcpScopeRead} {
		names := map[string]bool{}
		for _, tool := range mcpDirectToolsForScope(scope) {
			names[tool["name"].(string)] = true
		}
		require.True(t, names[mcpToolRenderVideo], scope)
	}
	both := map[string]int{}
	h := &MCPHandler{}
	for _, tool := range h.mcpAdvertisedToolsForScope(mcpScopeFull, mcpToolModeBoth) {
		both[tool["name"].(string)]++
	}
	require.Equal(t, 1, both[mcpToolRenderVideo], "listed once in both mode")
}

func TestMCPVideoWidgetResource(t *testing.T) {
	h := &MCPHandler{publicURL: "https://app.example.com/"}
	listed := h.listMCPResources().(map[string]any)["resources"].([]map[string]any)
	var found map[string]any
	for _, resource := range listed {
		if resource["uri"] == mcpVideoWidgetURI {
			found = resource
		}
	}
	require.NotNil(t, found)
	require.Equal(t, mcpAppWidgetMimeType, found["mimeType"])

	raw, err := json.Marshal(map[string]any{"uri": mcpVideoWidgetURI})
	require.NoError(t, err)
	read, rpcErr := h.readMCPResource(raw)
	require.Nil(t, rpcErr)
	content := read.(map[string]any)["contents"].([]map[string]any)[0]
	html := content["text"].(string)
	for _, required := range []string{
		`var renderTool="` + mcpToolRenderVideo + `"`,
		`method:'ui/initialize'`,
		`toolResponseMetadata`,
		`callTool(tool,{workspace_id:state.output.workspace_id,media_id:id})`,
		`role="status" aria-live="polite"`,
		`openExternal`,
	} {
		require.Contains(t, html, required)
	}
	meta := content["_meta"].(map[string]any)
	csp := meta["openai/widgetCSP"].(map[string]any)
	// Playback links point at the dopost origin, so it must be a resource domain.
	require.Equal(t, []string{"https://app.example.com"}, csp["resource_domains"])
	require.Equal(t, "https://app.example.com", meta["openai/widgetDomain"])
}
