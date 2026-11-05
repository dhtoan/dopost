// Package urlimport downloads the media behind a page link (a TikTok, YouTube,
// Instagram or X post, …) with yt-dlp, after Donkey Cut's URL import
// (site/src/cut/server/urlImport.ts and urlDownload.ts, commit cddf34f,
// Apache-2.0): one guarded download at a time per slot, into a temp folder
// the caller reads and then removes.
//
// yt-dlp fetches pages and media itself, so the server checks only that the
// link's host is public before handing it over. That is why the feature is
// off unless the operator turns it on.
package urlimport

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/openpost/backend/internal/netguard"
)

var (
	// ErrDisabled means the operator has not turned URL import on.
	ErrDisabled = errors.New("url import is not enabled on this server")
	// ErrBusy means every download slot is taken.
	ErrBusy = errors.New("too many link imports are running; try again in a moment")
	// ErrInvalidURL means the link is not a public http(s) address.
	ErrInvalidURL = errors.New("enter a public http(s) link")
	// ErrNoMedia means the page had nothing yt-dlp could download.
	ErrNoMedia = errors.New("that link has no video, audio or image to import")
	// ErrTooLarge means the file is over the size limit.
	ErrTooLarge = errors.New("that file is larger than this server allows")
)

// Config is what the operator sets.
type Config struct {
	Enabled bool
	// Binary is the yt-dlp executable, a name on PATH or a full path.
	Binary string
	// MaxBytes caps one download.
	MaxBytes int64
	// Timeout caps one download from start to finish.
	Timeout time.Duration
	// Slots caps downloads running at once.
	Slots int
	// CookiesFile is an optional Netscape cookie file for sites that ask a
	// signed-in visitor (YouTube often does from servers). Read-only to yt-dlp.
	CookiesFile string
}

// Source is what the page said about the media.
type Source struct {
	Title     string
	Uploader  string
	PageURL   string
	ID        string
	Extractor string
}

// Download is one finished download. Close removes its files.
type Download struct {
	Path     string
	FileName string
	MimeType string
	Size     int64
	Source   Source
	dir      string
}

func (d *Download) Close() error {
	if d == nil || d.dir == "" {
		return nil
	}
	return os.RemoveAll(d.dir)
}

// Importer runs yt-dlp.
type Importer struct {
	config   Config
	slots    chan struct{}
	resolver netguard.Resolver
	run      func(ctx context.Context, binary string, args ...string) ([]byte, error)
}

func New(config Config) *Importer {
	if config.Binary == "" {
		config.Binary = "yt-dlp"
	}
	if config.MaxBytes <= 0 {
		config.MaxBytes = 1 << 30
	}
	if config.Timeout <= 0 {
		config.Timeout = 10 * time.Minute
	}
	if config.Slots <= 0 {
		config.Slots = 2
	}
	return &Importer{config: config, slots: make(chan struct{}, config.Slots), run: runCommand}
}

func (i *Importer) Enabled() bool {
	return i != nil && i.config.Enabled
}

// formatSelector prefers H.264 video with AAC audio at up to 1080p, which
// every browser decodes, then falls back to the best file under that height,
// then to anything.
const formatSelector = "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]/b"

func (i *Importer) args(dir, link string) []string {
	args := []string{
		"--ignore-config", "--no-playlist", "--no-progress", "--no-warnings", "--no-cache-dir",
		"--restrict-filenames", "--no-exec", "--socket-timeout", "30", "--encoding", "utf-8",
		"--match-filter", "!is_live",
		"--max-filesize", strconv.FormatInt(i.config.MaxBytes, 10),
		"-f", formatSelector, "--merge-output-format", "mp4",
		"--write-info-json", "-o", filepath.Join(dir, "media.%(ext)s"),
	}
	if i.config.CookiesFile != "" {
		args = append(args, "--cookies", i.config.CookiesFile)
	}
	return append(args, "--", link)
}

// Fetch downloads the media behind link. The caller must Close the result.
func (i *Importer) Fetch(ctx context.Context, link string) (*Download, error) {
	if !i.Enabled() {
		return nil, ErrDisabled
	}
	remote, err := url.Parse(strings.TrimSpace(link))
	if err != nil {
		return nil, ErrInvalidURL
	}
	if err := netguard.ValidateURL(ctx, remote, netguard.URLPolicy{
		Label: "link", AllowedSchemes: []string{"https", "http"}, AllowCustomPorts: false, Resolver: i.resolver,
	}); err != nil {
		return nil, ErrInvalidURL
	}
	select {
	case i.slots <- struct{}{}:
	default:
		return nil, ErrBusy
	}
	defer func() { <-i.slots }()

	dir, err := os.MkdirTemp("", "dopost-url-import-")
	if err != nil {
		return nil, err
	}
	download := &Download{dir: dir}
	ok := false
	defer func() {
		if !ok {
			_ = download.Close()
		}
	}()
	runCtx, cancel := context.WithTimeout(ctx, i.config.Timeout)
	defer cancel()
	if output, err := i.run(runCtx, i.config.Binary, i.args(dir, remote.String())...); err != nil {
		if runCtx.Err() != nil {
			return nil, fmt.Errorf("the download took longer than %s", i.config.Timeout)
		}
		return nil, downloadError(output, err)
	}
	if err := download.collect(i.config.MaxBytes); err != nil {
		return nil, err
	}
	ok = true
	return download, nil
}

// collect finds the downloaded file and the page details yt-dlp wrote beside it.
func (d *Download) collect(maxBytes int64) error {
	entries, err := os.ReadDir(d.dir)
	if err != nil {
		return err
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.IsDir() || strings.HasSuffix(name, ".json") || strings.HasSuffix(name, ".part") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if d.Path != "" {
			// A merge leaves one file; anything else is a partial or a format
			// yt-dlp kept apart, so keep the larger.
			if info.Size() <= d.Size {
				continue
			}
		}
		d.Path = filepath.Join(d.dir, name)
		d.Size = info.Size()
	}
	if d.Path == "" {
		return ErrNoMedia
	}
	if d.Size > maxBytes {
		return ErrTooLarge
	}
	var details struct {
		Title       string `json:"title"`
		Uploader    string `json:"uploader"`
		Channel     string `json:"channel"`
		WebpageURL  string `json:"webpage_url"`
		ID          string `json:"id"`
		ExtractorID string `json:"extractor_key"`
	}
	if raw, err := os.ReadFile(filepath.Join(d.dir, "media.info.json")); err == nil {
		_ = json.Unmarshal(raw, &details)
	}
	d.Source = Source{
		Title: strings.TrimSpace(details.Title), Uploader: firstNonEmpty(details.Uploader, details.Channel),
		PageURL: details.WebpageURL, ID: details.ID, Extractor: details.ExtractorID,
	}
	ext := strings.ToLower(filepath.Ext(d.Path))
	d.MimeType = mimeTypeFor(ext)
	d.FileName = fileName(d.Source.Title, ext)
	return nil
}

func mimeTypeFor(ext string) string {
	switch ext {
	case ".mp4", ".m4v":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".mov":
		return "video/quicktime"
	case ".m4a":
		return "audio/mp4"
	case ".mp3":
		return "audio/mpeg"
	case ".opus", ".ogg":
		return "audio/ogg"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	}
	if byExt := mime.TypeByExtension(ext); byExt != "" {
		return byExt
	}
	return "application/octet-stream"
}

// fileName turns the page title into a short, safe file name.
func fileName(title, ext string) string {
	var b strings.Builder
	for _, r := range title {
		switch {
		case r == '/' || r == '\\' || r == ':' || r == '*' || r == '?' || r == '"' || r == '<' || r == '>' || r == '|' || r < 32:
			b.WriteRune(' ')
		default:
			b.WriteRune(r)
		}
	}
	name := strings.Join(strings.Fields(b.String()), " ")
	if runes := []rune(name); len(runes) > 80 {
		name = strings.TrimSpace(string(runes[:80]))
	}
	if name == "" {
		name = "Imported media"
	}
	return name + ext
}

// downloadError keeps the last line yt-dlp printed, which names the reason.
func downloadError(output []byte, err error) error {
	if errors.Is(err, exec.ErrNotFound) {
		return fmt.Errorf("%w: yt-dlp is not installed", ErrDisabled)
	}
	lines := strings.Split(strings.TrimSpace(string(output)), "\n")
	for index := len(lines) - 1; index >= 0; index-- {
		line := strings.TrimSpace(lines[index])
		if strings.HasPrefix(line, "ERROR:") {
			message := strings.TrimSpace(strings.TrimPrefix(line, "ERROR:"))
			if strings.Contains(message, "max-filesize") || strings.Contains(message, "larger than max") {
				return ErrTooLarge
			}
			if len(message) > 300 {
				message = message[:300]
			}
			return errors.New(message)
		}
	}
	return ErrNoMedia
}

func runCommand(ctx context.Context, binary string, args ...string) ([]byte, error) {
	command := exec.CommandContext(ctx, binary, args...)
	// yt-dlp is Python: without this a Windows console code page garbles its messages.
	command.Env = append(os.Environ(), "PYTHONIOENCODING=utf-8", "PYTHONUTF8=1")
	return command.CombinedOutput()
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			return value
		}
	}
	return ""
}
