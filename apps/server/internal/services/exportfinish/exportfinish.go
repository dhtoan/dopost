// Package exportfinish turns a browser-rendered export into delivery formats
// the browser cannot encode, with ffmpeg on the server: ProRes 422 HQ for
// further editing, H.265, and a smaller constant-quality H.264, each with an
// optional loudness pass. After Donkey Cut's server export
// (site/src/cut/server/exportPipeline.ts, commit cddf34f, Apache-2.0), which
// renders the whole timeline in ffmpeg; here the picture is already final, so
// the server only re-encodes it and the export still matches the preview.
//
// Jobs live in memory for one server process: the upload is written to a
// temp file, ffmpeg runs in the background, and the result is downloaded once
// and removed. Unfetched jobs are removed after an hour.
package exportfinish

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

var (
	ErrDisabled      = errors.New("server finishing is not enabled on this server")
	ErrUnknownTarget = errors.New("unknown finishing target")
	ErrBusy          = errors.New("another export is finishing; try again when it is done")
	ErrNotFound      = errors.New("finishing job not found")
	ErrNotReady      = errors.New("the finished file is not ready")
)

// Target is one delivery format.
type Target struct {
	ID        string   `json:"id"`
	Extension string   `json:"extension"`
	MimeType  string   `json:"mime_type"`
	args      []string // video and audio encoder arguments
}

// Targets are the formats the server makes, in the order the editor lists them.
var Targets = []Target{
	{ID: "prores-hq", Extension: ".mov", MimeType: "video/quicktime", args: []string{
		"-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0", "-pix_fmt", "yuv422p10le",
		"-c:a", "pcm_s16le",
	}},
	{ID: "hevc", Extension: ".mp4", MimeType: "video/mp4", args: []string{
		"-c:v", "libx265", "-crf", "22", "-preset", "medium", "-tag:v", "hvc1", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
	}},
	{ID: "h264-small", Extension: ".mp4", MimeType: "video/mp4", args: []string{
		"-c:v", "libx264", "-crf", "20", "-preset", "slow", "-profile:v", "high", "-pix_fmt", "yuv420p",
		"-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
	}},
}

func targetByID(id string) (Target, bool) {
	for _, target := range Targets {
		if target.ID == id {
			return target, true
		}
	}
	return Target{}, false
}

// Loudness is the single-pass loudnorm target: -14 LUFS integrated with a
// -1 dBTP ceiling, where most streaming platforms play back.
const loudnessFilter = "loudnorm=I=-14:TP=-1:LRA=11"

// Config is what the operator sets.
type Config struct {
	Enabled bool
	FFmpeg  string
	FFprobe string
	// Slots caps exports finishing at once; ffmpeg uses every core it gets.
	Slots int
	// TTL removes a job nobody downloaded.
	TTL time.Duration
}

type Status string

const (
	StatusRunning   Status = "running"
	StatusDone      Status = "done"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
)

// Job is one finishing run.
type Job struct {
	ID       string  `json:"id"`
	Target   string  `json:"target"`
	Status   Status  `json:"status"`
	Progress float64 `json:"progress"`
	Error    string  `json:"error,omitempty"`
	FileName string  `json:"file_name"`
	MimeType string  `json:"mime_type"`
	Size     int64   `json:"size,omitempty"`

	owner   string
	dir     string
	output  string
	created time.Time
	cancel  context.CancelFunc
}

// Service runs finishing jobs.
type Service struct {
	config Config
	slots  chan struct{}
	now    func() time.Time
	run    func(ctx context.Context, name string, args []string, progress func(io.Reader)) error

	mu   sync.Mutex
	jobs map[string]*Job
}

func New(config Config) *Service {
	if config.FFmpeg == "" {
		config.FFmpeg = "ffmpeg"
	}
	if config.FFprobe == "" {
		config.FFprobe = siblingTool(config.FFmpeg, "ffprobe")
	}
	if config.Slots <= 0 {
		config.Slots = 1
	}
	if config.TTL <= 0 {
		config.TTL = time.Hour
	}
	return &Service{
		config: config, slots: make(chan struct{}, config.Slots), now: time.Now,
		run: runFFmpeg, jobs: map[string]*Job{},
	}
}

// siblingTool finds ffprobe beside a configured ffmpeg path.
func siblingTool(ffmpeg, name string) string {
	dir := filepath.Dir(ffmpeg)
	if dir == "." || dir == "" {
		return name
	}
	return filepath.Join(dir, name+filepath.Ext(ffmpeg))
}

func (s *Service) Enabled() bool { return s != nil && s.config.Enabled }

// Start takes ownership of the uploaded file at input and begins finishing it.
func (s *Service) Start(owner, targetID, name string, loudness bool, input string) (*Job, error) {
	if !s.Enabled() {
		_ = os.Remove(input)
		return nil, ErrDisabled
	}
	target, ok := targetByID(targetID)
	if !ok {
		_ = os.Remove(input)
		return nil, ErrUnknownTarget
	}
	s.sweep()
	select {
	case s.slots <- struct{}{}:
	default:
		_ = os.Remove(input)
		return nil, ErrBusy
	}
	dir, err := os.MkdirTemp("", "dopost-finish-")
	if err != nil {
		<-s.slots
		_ = os.Remove(input)
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	job := &Job{
		ID: newID(), Target: target.ID, Status: StatusRunning, FileName: fileName(name, target.Extension),
		MimeType: target.MimeType, owner: owner, dir: dir, output: filepath.Join(dir, "finished"+target.Extension),
		created: s.now(), cancel: cancel,
	}
	s.mu.Lock()
	s.jobs[job.ID] = job
	s.mu.Unlock()
	go s.finish(ctx, job, target, loudness, input)
	return s.snapshot(job), nil
}

// Args is the ffmpeg command line for one job, without the binary.
func Args(target Target, loudness bool, input, output string) []string {
	args := []string{"-hide_banner", "-nostdin", "-y", "-i", input, "-map", "0:v:0", "-map", "0:a:0?"}
	args = append(args, target.args...)
	if loudness {
		args = append(args, "-af", loudnessFilter, "-ar", "48000")
	}
	return append(args, "-progress", "pipe:1", "-nostats", output)
}

func (s *Service) finish(ctx context.Context, job *Job, target Target, loudness bool, input string) {
	defer func() { <-s.slots }()
	defer func() { _ = os.Remove(input) }()
	duration := s.probeDuration(ctx, input)
	err := s.run(ctx, s.config.FFmpeg, Args(target, loudness, input, job.output), func(r io.Reader) {
		readProgress(r, duration, func(progress float64) {
			s.mu.Lock()
			job.Progress = progress
			s.mu.Unlock()
		})
	})
	s.mu.Lock()
	defer s.mu.Unlock()
	switch {
	case ctx.Err() != nil:
		job.Status = StatusCancelled
	case err != nil:
		job.Status = StatusFailed
		job.Error = err.Error()
	default:
		info, statErr := os.Stat(job.output)
		if statErr != nil || info.Size() == 0 {
			job.Status = StatusFailed
			job.Error = "ffmpeg wrote no file"
			break
		}
		job.Status = StatusDone
		job.Progress = 1
		job.Size = info.Size()
	}
	if job.Status != StatusDone {
		_ = os.RemoveAll(job.dir)
	}
}

func (s *Service) probeDuration(ctx context.Context, input string) float64 {
	probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	out, err := exec.CommandContext(probeCtx, s.config.FFprobe, "-v", "error", "-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1", input).Output()
	if err != nil {
		return 0
	}
	seconds, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	return seconds
}

// readProgress follows ffmpeg's -progress lines and reports the share done.
func readProgress(r io.Reader, duration float64, report func(float64)) {
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		key, value, ok := strings.Cut(scanner.Text(), "=")
		if !ok || key != "out_time_us" || duration <= 0 {
			continue
		}
		micros, err := strconv.ParseFloat(value, 64)
		if err != nil || micros < 0 {
			continue
		}
		report(min(0.99, micros/1e6/duration))
	}
}

// Get returns a copy of the owner's job.
func (s *Service) Get(owner, id string) (*Job, error) {
	s.sweep()
	s.mu.Lock()
	defer s.mu.Unlock()
	job, ok := s.jobs[id]
	if !ok || job.owner != owner {
		return nil, ErrNotFound
	}
	clone := *job
	return &clone, nil
}

// Open hands over the finished file; Close on the result removes the job.
func (s *Service) Open(owner, id string) (*Job, io.ReadCloser, error) {
	job, err := s.Get(owner, id)
	if err != nil {
		return nil, nil, err
	}
	if job.Status != StatusDone {
		return nil, nil, ErrNotReady
	}
	file, err := os.Open(job.output)
	if err != nil {
		return nil, nil, err
	}
	return job, &removeOnClose{File: file, done: func() { s.remove(id) }}, nil
}

// Cancel stops a running job and removes it.
func (s *Service) Cancel(owner, id string) error {
	if _, err := s.Get(owner, id); err != nil {
		return err
	}
	s.remove(id)
	return nil
}

func (s *Service) remove(id string) {
	s.mu.Lock()
	job, ok := s.jobs[id]
	delete(s.jobs, id)
	running := ok && job.Status == StatusRunning
	s.mu.Unlock()
	if !ok {
		return
	}
	job.cancel()
	if !running {
		_ = os.RemoveAll(job.dir)
	}
	// A running job's goroutine removes its own folder once ffmpeg exits.
}

// sweep removes jobs nobody fetched within the TTL.
func (s *Service) sweep() {
	s.mu.Lock()
	var stale []string
	for id, job := range s.jobs {
		if s.now().Sub(job.created) > s.config.TTL {
			stale = append(stale, id)
		}
	}
	s.mu.Unlock()
	for _, id := range stale {
		s.remove(id)
	}
}

func (s *Service) snapshot(job *Job) *Job {
	s.mu.Lock()
	defer s.mu.Unlock()
	clone := *job
	return &clone
}

type removeOnClose struct {
	*os.File
	done func()
	once sync.Once
}

func (r *removeOnClose) Close() error {
	err := r.File.Close()
	r.once.Do(r.done)
	return err
}

func runFFmpeg(ctx context.Context, name string, args []string, progress func(io.Reader)) error {
	command := exec.CommandContext(ctx, name, args...)
	stdout, err := command.StdoutPipe()
	if err != nil {
		return err
	}
	var stderr strings.Builder
	command.Stderr = &limitedWriter{builder: &stderr, limit: 64 * 1024}
	if err := command.Start(); err != nil {
		return err
	}
	progress(stdout)
	if err := command.Wait(); err != nil {
		return fmt.Errorf("ffmpeg failed: %s", lastLine(stderr.String(), err))
	}
	return nil
}

type limitedWriter struct {
	builder *strings.Builder
	limit   int
}

func (w *limitedWriter) Write(p []byte) (int, error) {
	if remaining := w.limit - w.builder.Len(); remaining > 0 {
		w.builder.Write(p[:min(len(p), remaining)])
	}
	return len(p), nil
}

func lastLine(output string, err error) string {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	if line := strings.TrimSpace(lines[len(lines)-1]); line != "" {
		if len(line) > 300 {
			line = line[:300]
		}
		return line
	}
	return err.Error()
}

func fileName(name, ext string) string {
	base := strings.TrimSpace(strings.TrimSuffix(filepath.Base(name), filepath.Ext(name)))
	var b strings.Builder
	for _, r := range base {
		if strings.ContainsRune(`/\:*?"<>|`, r) || r < 32 {
			b.WriteRune(' ')
			continue
		}
		b.WriteRune(r)
	}
	base = strings.Join(strings.Fields(b.String()), " ")
	if base == "" || base == "." {
		base = "export"
	}
	return base + ext
}

func newID() string {
	raw := make([]byte, 16)
	_, _ = rand.Read(raw)
	return hex.EncodeToString(raw)
}
