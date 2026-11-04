// Adapted from Donkey Cut (site/src/clients/chatgpt/ui/PreviewApp.tsx and
// server/mcp.ts, commit cddf34f), Copyright 2026 Donkey, Apache-2.0. Modified
// for dopost: a read-only player card over workspace video media and cloud
// video projects, served as an MCP Apps widget. See NOTICE.md.

package handlers

import (
	"context"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/openpost/backend/internal/models"
)

const (
	mcpToolRenderVideo  = "render_video_player"
	mcpVideoWidgetURI   = "ui://widget/dopost-video-v1.html"
	mcpVideoWidgetLimit = 12
)

func mcpRenderVideoPlayerTool() map[string]any {
	return mcpToolDescriptor(map[string]any{
		"name":  mcpToolRenderVideo,
		"title": "Play dopost videos",
		"description": "Show a dopost workspace's videos in an in-chat player: recent finished videos from Media (exports, AI generations, uploads) and cloud Video Editor projects with links to open them. " +
			"Pass media_id to play one video. Returns video and project names, IDs and lengths; playback links go only to the player.",
		"inputSchema": map[string]any{
			"type": "object",
			"properties": map[string]any{
				"workspace_id": map[string]any{"type": "string", "description": "Workspace ID returned by list_workspaces."},
				"media_id":     map[string]any{"type": "string", "description": "Optional video media ID to play, from list_media or an earlier call."},
			},
			"required": []string{"workspace_id"}, "additionalProperties": false,
		},
	}, mcpToolSafety{ReadOnly: true, Idempotent: true})
}

type mcpVideoItem struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Source     string `json:"source"`
	DurationMS int64  `json:"duration_ms"`
	Width      int    `json:"width"`
	Height     int    `json:"height"`
	CreatedAt  string `json:"created_at"`
}

type mcpVideoProjectItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	UpdatedAt string `json:"updated_at"`
	EditorURL string `json:"editor_url,omitempty"`
}

func mcpVideoItemFrom(media models.MediaAttachment) mcpVideoItem {
	name := strings.TrimSpace(media.OriginalFilename)
	if name == "" {
		name = media.ID
	}
	return mcpVideoItem{ID: media.ID, Name: name, Source: media.Source, DurationMS: media.DurationMS, Width: media.Width, Height: media.Height, CreatedAt: media.CreatedAt.UTC().Format(time.RFC3339)}
}

// renderVideoPlayer lists the workspace's recent videos and cloud video
// projects, and resolves a short-lived playback link for the chosen video.
// Links travel in _meta, which reaches the widget but not the model.
func (h *MCPHandler) renderVideoPlayer(ctx context.Context, userID string, args map[string]any) (any, *mcpError) {
	var input struct {
		WorkspaceID string `json:"workspace_id"`
		MediaID     string `json:"media_id"`
	}
	if err := decodeMCPArguments(args, &input); err != nil {
		return nil, &mcpError{Code: -32602, Message: "invalid render_video_player arguments"}
	}
	input.WorkspaceID = strings.TrimSpace(input.WorkspaceID)
	input.MediaID = strings.TrimSpace(input.MediaID)
	if rpcErr := h.ensureWorkspaceAccess(ctx, userID, input.WorkspaceID); rpcErr != nil {
		return nil, rpcErr
	}

	var videos []models.MediaAttachment
	if err := h.db.NewSelect().Model(&videos).
		Where("workspace_id = ?", input.WorkspaceID).
		Where("trashed_at IS NULL").
		Where("processing_status = ?", "ready").
		Where("asset_kind = ?", "library").
		Where("mime_type LIKE ?", "video/%").
		Order("created_at DESC").Limit(mcpVideoWidgetLimit).Scan(ctx); err != nil {
		return nil, &mcpError{Code: -32603, Message: "could not load videos"}
	}

	var selected *models.MediaAttachment
	if input.MediaID != "" {
		var media models.MediaAttachment
		err := h.db.NewSelect().Model(&media).
			Where("id = ? AND workspace_id = ?", input.MediaID, input.WorkspaceID).
			Where("trashed_at IS NULL").
			Scan(ctx)
		if err != nil || !strings.HasPrefix(media.MimeType, "video/") || media.ProcessingStatus != "ready" {
			return nil, &mcpError{Code: -32602, Message: "media_id is not a ready video in this workspace"}
		}
		selected = &media
	} else if len(videos) > 0 {
		selected = &videos[0]
	}

	var projects []models.VideoProject
	if err := h.db.NewSelect().Model(&projects).
		Column("id", "name", "updated_at").
		Where("workspace_id = ?", input.WorkspaceID).
		Where("trashed_at IS NULL").
		Order("updated_at DESC").Limit(mcpVideoWidgetLimit).Scan(ctx); err != nil {
		return nil, &mcpError{Code: -32603, Message: "could not load video projects"}
	}

	origin := strings.TrimRight(strings.TrimSpace(h.publicURL), "/")
	videoItems := make([]mcpVideoItem, 0, len(videos))
	for _, media := range videos {
		videoItems = append(videoItems, mcpVideoItemFrom(media))
	}
	projectItems := make([]mcpVideoProjectItem, 0, len(projects))
	for _, project := range projects {
		item := mcpVideoProjectItem{ID: project.ID, Name: project.Name, UpdatedAt: project.UpdatedAt.UTC().Format(time.RFC3339)}
		if origin != "" {
			item.EditorURL = origin + "/video-editor/" + url.PathEscape(project.ID) + "?storage=cloud"
		}
		projectItems = append(projectItems, item)
	}

	structured := map[string]any{
		"workspace_id": input.WorkspaceID,
		"videos":       videoItems,
		"projects":     projectItems,
	}
	meta := map[string]any{}
	text := fmt.Sprintf("Showing %d videos and %d video projects.", len(videoItems), len(projectItems))
	if selected != nil {
		item := mcpVideoItemFrom(*selected)
		structured["selected"] = item
		if link := h.publicMedia.URL(*selected); link != "" {
			meta["playback"] = map[string]any{"media_id": selected.ID, "url": link, "mime_type": selected.MimeType}
		}
		text = fmt.Sprintf("Playing %s. %s", item.Name, text)
	}
	return map[string]any{
		"content":           []mcpContent{{Type: "text", Text: text}},
		"structuredContent": structured,
		"_meta":             meta,
	}, nil
}

func (h *MCPHandler) mcpVideoWidgetResourceMeta() map[string]any {
	domain := mcpWidgetDomain(h.publicURL)
	resourceDomains := []string{}
	if domain != "" {
		resourceDomains = append(resourceDomains, domain)
	}
	standardCSP := map[string]any{"connectDomains": []string{}, "resourceDomains": resourceDomains}
	legacyCSP := map[string]any{"connect_domains": []string{}, "resource_domains": resourceDomains}
	ui := map[string]any{"prefersBorder": true, "csp": standardCSP}
	meta := map[string]any{
		"ui":                         ui,
		"openai/widgetDescription":   "dopost video player for finished videos and cloud Video Editor projects.",
		"openai/widgetPrefersBorder": true,
		"openai/widgetCSP":           legacyCSP,
	}
	if domain != "" {
		meta["openai/widgetDomain"] = domain
		ui["domain"] = domain
	}
	return meta
}

func mcpVideoWidgetHTML() string {
	return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>dopost videos</title>
<style>` + mcpUIStyles + `
body{padding:12px}main{display:grid;gap:12px}
h1{font-size:16px;margin:0;overflow-wrap:anywhere}h2{font-size:12px;margin:0 0 6px;color:var(--muted-foreground);font-weight:650}
.player{background:#000;border-radius:var(--theme-radius-md);overflow:hidden;display:grid;place-items:center;min-height:120px}
.player video{width:100%;max-height:420px;display:block;background:#000}.player .empty{color:#d0d0d0;padding:16px}
.empty,.status{color:var(--muted-foreground);font-size:13px;margin:0}
ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
li>button,li>a{box-sizing:border-box;width:100%;min-height:40px;display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 10px;border:1px solid var(--border);border-radius:var(--theme-radius-md);background:none;color:var(--foreground);font:inherit;text-align:left;text-decoration:none;cursor:pointer}
li>button:focus-visible,li>a:focus-visible{outline:2px solid var(--ring);outline-offset:2px}
li>button[aria-current="true"]{border-color:var(--ring)}
.name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.meta{color:var(--muted-foreground);white-space:nowrap}
</style></head><body><main>
<h1 id="title">dopost videos</h1>
<div class="player" id="player"><p class="empty">No video selected.</p></div>
<p class="status" id="status" role="status" aria-live="polite"></p>
<section><h2>Videos</h2><ul id="videos"></ul></section>
<section><h2>Video projects</h2><ul id="projects"></ul></section>
</main>
<script>
(function(){
var renderTool=` + fmt.Sprintf("%q", mcpToolRenderVideo) + `,toolPromise=null;
var state={output:null,playback:null};
// Gateways in front of MCP servers can rename tools (for example
// {server_id}_{tool_name}). The MCP Apps ui/initialize handshake reports the
// host-exposed name of the tool that rendered this widget; that is the name
// to call to switch videos. Without host metadata the bare name is used.
function resolveTool(){if(toolPromise)return toolPromise;toolPromise=new Promise(function(resolve){var request={jsonrpc:'2.0',id:'dopost-video-init',method:'ui/initialize',params:{appInfo:{name:'dopost-video',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}};var timer=null;function finish(name){if(timer!==null)window.clearTimeout(timer);window.removeEventListener('message',onHost);resolve(name)}function onHost(event){if(event.source!==window.parent)return;var data=event.data;if(!data||data.jsonrpc!=='2.0'||data.id!==request.id)return;window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');var invoked=data.result&&data.result.hostContext&&data.result.hostContext.toolInfo&&data.result.hostContext.toolInfo.tool&&data.result.hostContext.toolInfo.tool.name;finish(typeof invoked==='string'&&invoked.slice(-renderTool.length)===renderTool?invoked:renderTool)}timer=window.setTimeout(function(){finish(renderTool)},3000);window.addEventListener('message',onHost);window.parent.postMessage(request,'*')});return toolPromise}
function el(id){return document.getElementById(id)}
function text(node,value){node.textContent=value==null?'':String(value)}
function length(ms){if(!ms)return '';var s=Math.round(ms/1000);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')}
function read(){var o=window.openai||{};state.output=o.toolOutput||state.output;var meta=o.toolResponseMetadata;state.playback=(meta&&meta.playback)||state.playback;render()}
function play(){var p=el('player'),sel=state.output&&state.output.selected;p.textContent='';var note=document.createElement('p');note.className='empty';
if(!sel){note.textContent='No videos yet. Export one from the Video Editor or generate one.';p.appendChild(note);return}
if(!state.playback||state.playback.media_id!==sel.id){note.textContent='Preparing playback…';p.appendChild(note);return}
var v=document.createElement('video');v.controls=true;v.playsInline=true;v.preload='metadata';v.src=state.playback.url;v.setAttribute('aria-label',sel.name);
// An expired link fails to load; asking for the video again signs a fresh one.
v.addEventListener('error',function(){if(!v.dataset.retried){v.dataset.retried='1';choose(sel.id)}},{once:true});p.appendChild(v)}
async function choose(id){var o=window.openai;if(!o||!o.callTool){text(el('status'),'This client cannot switch videos here. Ask to play the video instead.');return}
text(el('status'),'Loading…');try{var tool=await resolveTool();var r=await o.callTool(tool,{workspace_id:state.output.workspace_id,media_id:id});state.output=r.structuredContent||state.output;state.playback=(r._meta&&r._meta.playback)||null;text(el('status'),'');render()}catch(e){text(el('status'),e&&e.message?e.message:'The video could not be loaded.')}}
function openLink(href){var o=window.openai;if(o&&o.openExternal){o.openExternal({href:href})}else{window.open(href,'_blank','noopener')}}
function row(list,label,meta){var li=document.createElement('li'),n=document.createElement('span'),m=document.createElement('span');n.className='name';m.className='meta';text(n,label);text(m,meta);list.appendChild(li);return {li:li,parts:[n,m]}}
function empty(list,message){var li=document.createElement('li');li.className='empty';li.textContent=message;list.appendChild(li)}
function render(){var out=state.output;if(!out)return;var sel=out.selected;text(el('title'),sel?sel.name:'dopost videos');play();
var vl=el('videos');vl.textContent='';(out.videos||[]).forEach(function(item){var r=row(vl,item.name,length(item.duration_ms)),b=document.createElement('button');b.type='button';b.append.apply(b,r.parts);if(sel&&sel.id===item.id)b.setAttribute('aria-current','true');b.addEventListener('click',function(){choose(item.id)});r.li.appendChild(b)});
if(!(out.videos||[]).length)empty(vl,'No finished videos in this workspace yet.');
var pl=el('projects');pl.textContent='';(out.projects||[]).forEach(function(item){var r=row(pl,item.name,'Open in dopost'),a=document.createElement('a');a.append.apply(a,r.parts);if(item.editor_url){a.href=item.editor_url;a.addEventListener('click',function(ev){ev.preventDefault();openLink(item.editor_url)})}r.li.appendChild(a)});
if(!(out.projects||[]).length)empty(pl,'No cloud video projects yet.')}
window.addEventListener('openai:set_globals',read);read();resolveTool();
})();
</script>
</body></html>`
}
